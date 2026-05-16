import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { courses } from "../src/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

type CuratedEntry = {
  name: string;
  aliases: string[];
  slug: string;
  state: string | null;
  parent?: string; // slug of the parent course (for multi-course resorts)
  country?: string; // ISO country code (default "US")
};

async function loadCurated(): Promise<CuratedEntry[]> {
  const file = path.resolve(process.cwd(), "data/curated-courses.json");
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as CuratedEntry[];
}

function buildCandidateNames(entry: CuratedEntry): string[] {
  return [entry.name, ...entry.aliases]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const sqlClient = neon(DATABASE_URL!);
  const db = drizzle({ client: sqlClient });

  const entries = await loadCurated();
  console.log(`Curated entries: ${entries.length}`);

  // Idempotency: drop pure-curated rows (no OSM backing) and un-mark any OSM
  // rows previously promoted to curated. The seed then re-applies cleanly.
  console.log("Resetting prior curated state...");
  // Clear parent links first — they reference courses we may be about to delete.
  await db.update(courses).set({ parentCourseId: null }).where(isNotNull(courses.parentCourseId));
  await db
    .delete(courses)
    .where(and(eq(courses.isCurated, true), isNull(courses.osmId)));
  await db
    .update(courses)
    .set({ isCurated: false, aliases: [] })
    .where(eq(courses.isCurated, true));

  let matched = 0;
  let inserted = 0;
  let slugConflicts = 0;
  const unmatched: string[] = [];

  for (const entry of entries) {
    const candidates = buildCandidateNames(entry);

    // Try to find an existing course (OSM-imported preferred) that matches by
    // case-insensitive name OR by any alias appearing in the candidate set.
    const lowerCandidates = candidates.map((s) => s.toLowerCase());
    const stateFilter = entry.state ?? null;

    const existing = await db
      .select({ id: courses.id, slug: courses.slug })
      .from(courses)
      .where(
        and(
          inArray(sql<string>`LOWER(${courses.name})`, lowerCandidates),
          // Match same-state OSM entries first; if state is unknown either side, allow it.
          stateFilter
            ? sql`(${courses.state} = ${stateFilter} OR ${courses.state} IS NULL)`
            : sql`TRUE`,
          isNotNull(courses.osmId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Promote OSM row to curated. Try to update slug to canonical; if that
      // collides with another row, leave the existing slug alone.
      const existingId = existing[0].id;
      const existingSlug = existing[0].slug;

      let useSlug = entry.slug;
      if (existingSlug !== entry.slug) {
        const collision = await db
          .select({ id: courses.id })
          .from(courses)
          .where(and(eq(courses.slug, entry.slug)))
          .limit(1);
        if (collision.length > 0 && collision[0].id !== existingId) {
          useSlug = existingSlug;
          slugConflicts++;
        }
      }

      await db
        .update(courses)
        .set({
          name: entry.name,
          aliases: entry.aliases,
          slug: useSlug,
          state: entry.state ?? undefined,
          isCurated: true,
        })
        .where(eq(courses.id, existingId));

      matched++;
    } else {
      // No OSM row matched — insert a fresh curated entry (no lat/lng/osm_id).
      try {
        await db
          .insert(courses)
          .values({
            name: entry.name,
            aliases: entry.aliases,
            slug: entry.slug,
            state: entry.state,
            country: entry.country ?? "US",
            isCurated: true,
          })
          .onConflictDoUpdate({
            target: courses.slug,
            set: {
              name: entry.name,
              aliases: entry.aliases,
              state: entry.state ?? undefined,
              country: entry.country ?? "US",
              isCurated: true,
            },
          });
        inserted++;
      } catch (err) {
        unmatched.push(`${entry.name} (insert failed: ${String(err).slice(0, 80)})`);
      }
    }
  }

  console.log(`\nResults:`);
  console.log(`  Matched to OSM and promoted: ${matched}`);
  console.log(`  Inserted as new curated rows: ${inserted}`);
  if (slugConflicts > 0) {
    console.log(`  Slug-conflicts (kept OSM slug instead of canonical): ${slugConflicts}`);
  }
  if (unmatched.length > 0) {
    console.log(`  Errors:`);
    for (const u of unmatched) console.log(`    - ${u}`);
  }

  const totalCurated = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(courses)
    .where(eq(courses.isCurated, true));
  console.log(`\nTotal curated rows now: ${totalCurated[0]?.count ?? 0}`);

  // Wire parent_course_id for multi-course resorts (Bandon, Pinehurst, etc.).
  await linkParents(db, entries);

  // Second pass: for curated rows that didn't match an OSM entry by exact name
  // (so osm_id is still null), try a pg_trgm similarity match in the same state.
  // High-confidence matches merge OSM geo data into the curated row.
  await fuzzyMatchPass(db);
}

async function linkParents(
  db: ReturnType<typeof drizzle>,
  entries: CuratedEntry[],
) {
  const children = entries.filter((e) => e.parent);
  if (children.length === 0) return;

  console.log(`\nLinking ${children.length} child courses to their resort parents...`);

  // Load slug → id for every curated row referenced. One round trip.
  const slugs = new Set<string>();
  for (const c of children) {
    slugs.add(c.slug);
    slugs.add(c.parent!);
  }
  const rows = await db
    .select({ id: courses.id, slug: courses.slug })
    .from(courses)
    .where(inArray(courses.slug, Array.from(slugs)));
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));

  let linked = 0;
  let missing = 0;
  for (const child of children) {
    const childId = idBySlug.get(child.slug);
    const parentId = idBySlug.get(child.parent!);
    if (!childId || !parentId) {
      missing++;
      console.log(
        `  ? could not link "${child.name}" (slug=${child.slug}) → parent=${child.parent} (childId=${childId}, parentId=${parentId})`,
      );
      continue;
    }
    await db
      .update(courses)
      .set({ parentCourseId: parentId })
      .where(eq(courses.id, childId));
    linked++;
  }
  console.log(`  Linked ${linked} child→parent. Missing: ${missing}.`);
}

async function fuzzyMatchPass(db: ReturnType<typeof drizzle>) {
  // Trigram similarity on course names is too noisy to safely auto-merge —
  // "Hudson National" looks similar to "Trump National Hudson Valley", and
  // "Payne's Valley" to "Sun Valley", because the shared tokens dominate.
  // For now this pass only reports candidates so they can be reviewed and
  // either added to the curated JSON's `aliases` (which makes the next seed
  // run match exactly) or flagged for the M4 review queue.
  const SIMILARITY_THRESHOLD = 0.5;

  console.log("\nFuzzy match pass (pg_trgm, report-only)...");
  const unmatchedCurated = await db
    .select({
      id: courses.id,
      name: courses.name,
      state: courses.state,
    })
    .from(courses)
    .where(
      and(
        eq(courses.isCurated, true),
        isNull(courses.osmId),
        isNotNull(courses.state),
      ),
    );

  console.log(`  Candidates (curated, no osm_id, state known): ${unmatchedCurated.length}`);

  let withCandidates = 0;
  for (const c of unmatchedCurated) {
    const result = (await db.execute(sql`
      SELECT name, similarity(name, ${c.name}) AS sim
      FROM courses
      WHERE state = ${c.state}
        AND osm_id IS NOT NULL
        AND is_curated = false
        AND similarity(name, ${c.name}) > ${SIMILARITY_THRESHOLD}
      ORDER BY sim DESC
      LIMIT 3
    `)) as unknown as {
      rows: Array<{ name: string; sim: number }>;
    };
    if (result.rows.length === 0) continue;
    withCandidates++;
    const summary = result.rows
      .map((m) => `"${m.name}" ${Number(m.sim).toFixed(2)}`)
      .join(", ");
    console.log(`  • "${c.name}" (${c.state}) → ${summary}`);
  }

  console.log(
    `\n  ${withCandidates} curated entries have plausible OSM matches.`,
  );
  console.log(
    `  Add the OSM names as aliases in data/curated-courses.json to merge them on the next run.`,
  );
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
