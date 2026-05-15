import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { courses } from "../src/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

type CuratedEntry = {
  name: string;
  aliases: string[];
  slug: string;
  state: string | null;
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
            country: "US",
            isCurated: true,
          })
          .onConflictDoUpdate({
            target: courses.slug,
            set: {
              name: entry.name,
              aliases: entry.aliases,
              state: entry.state ?? undefined,
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
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
