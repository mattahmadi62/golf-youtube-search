/**
 * One-shot recovery: find videos whose captions/titles/descriptions mention any
 * curated course that currently has no video_courses links, reset their
 * extracted_at, and let the next extract:courses re-process them.
 *
 * Background: an earlier version of seed-curated.ts deleted+re-inserted pure-
 * curated rows on every run, which cascaded out their video_courses. The seed
 * is now non-destructive, but the historically-lost links need to be re-walked.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

async function main() {
  const sql = neon(DATABASE_URL!);

  // 1. Curated courses that currently have NO video_courses rows pointing at them.
  const affected = (await sql`
    SELECT c.id, c.name, c.aliases
    FROM courses c
    WHERE c.is_curated = true
      AND c.osm_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM video_courses WHERE course_id = c.id)
  `) as Array<{ id: string; name: string; aliases: string[] }>;

  console.log(`Affected curated courses (no current matches): ${affected.length}`);

  // 2. Build a deduped set of search terms — canonical names + aliases.
  //    Skip very short tokens (<4 chars) to avoid noise like "the" / "GC".
  const tokens = new Set<string>();
  for (const c of affected) {
    if (c.name && c.name.length >= 4) tokens.add(c.name);
    for (const a of c.aliases ?? []) {
      if (a && a.length >= 4) tokens.add(a);
    }
  }
  // Filter very generic tokens that would over-match.
  const stop = new Set(["course", "club", "golf", "golf club", "country club", "links"]);
  const search = Array.from(tokens).filter((t) => !stop.has(t.toLowerCase()));
  console.log(`Search tokens: ${search.length}`);

  // 3. For each token, find videos whose captions or title mention it AND
  //    have extracted_at set (so re-extraction will pick them up). Collect
  //    a deduped set of video ids.
  const videoIds = new Set<string>();
  for (const token of search) {
    const rows = (await sql`
      SELECT id FROM videos
      WHERE extracted_at IS NOT NULL
        AND extraction_model NOT LIKE 'skipped%'
        AND (
          title ILIKE ${"%" + token + "%"}
          OR captions_text ILIKE ${"%" + token + "%"}
        )
    `) as Array<{ id: string }>;
    for (const r of rows) videoIds.add(r.id);
  }
  console.log(`Videos to re-extract: ${videoIds.size}`);

  if (videoIds.size === 0) {
    console.log("Nothing to do.");
    return;
  }

  // 4. Reset extracted_at on those videos so extract:courses re-processes them.
  const ids = Array.from(videoIds);
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const r = (await sql`
      UPDATE videos
      SET extracted_at = NULL, extraction_model = NULL
      WHERE id = ANY(${chunk}::uuid[])
      RETURNING id
    `) as Array<{ id: string }>;
    updated += r.length;
    process.stdout.write(`\r  reset ${updated}/${ids.length}   `);
  }
  process.stdout.write("\n");

  console.log(
    `\nDone. ${updated} videos reset. Run 'pnpm extract:courses' to re-process them.`,
  );
}

main().catch((err) => {
  console.error("Recovery failed:", err);
  process.exit(1);
});
