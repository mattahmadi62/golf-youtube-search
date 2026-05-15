/**
 * Retroactively apply the skip-filter to existing extracted videos.
 *
 *  - Delete `video_courses` rows whose source video is a Short or a podcast
 *    or other obvious non-course content.
 *  - Delete any `extraction_review_queue` rows pointing at those same videos
 *    (they'd just clutter the admin page).
 *  - Mark the videos themselves so the next run doesn't re-extract them.
 *
 * Reports counts in a `--dry-run` mode before committing.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { extractionReviewQueue, videoCourses, videos } from "../src/db/schema";
import { evaluateSkip } from "../src/lib/skip-filter";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

function parseArgs() {
  return { dryRun: process.argv.includes("--dry-run") };
}

async function main() {
  const args = parseArgs();
  const sqlClient = neon(DATABASE_URL!);
  const db = drizzle({ client: sqlClient });

  // Pull every video that has been extracted (extracted_at set). For each,
  // evaluate the skip filter; collect IDs to clean.
  const all = await db
    .select({
      id: videos.id,
      ytVideoId: videos.ytVideoId,
      title: videos.title,
      durationS: videos.durationS,
    })
    .from(videos)
    .where(isNotNull(videos.extractedAt));

  console.log(`Scanning ${all.length} extracted videos...`);

  const toSkipIds: string[] = [];
  const byReason: Record<string, number> = { short: 0, "title-pattern": 0 };
  const samples: Record<string, string[]> = { short: [], "title-pattern": [] };

  for (const v of all) {
    const result = evaluateSkip({ title: v.title, durationS: v.durationS });
    if (!result.skip) continue;
    toSkipIds.push(v.id);
    byReason[result.reason]++;
    const arr = samples[result.reason];
    if (arr.length < 5) arr.push(`[${v.ytVideoId}] ${v.title.slice(0, 80)}`);
  }

  console.log(`\nMatched ${toSkipIds.length} videos for cleanup:`);
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`  ${count} × ${reason}`);
    for (const ex of samples[reason]) console.log(`    e.g. ${ex}`);
  }

  if (toSkipIds.length === 0) {
    console.log("Nothing to clean.");
    return;
  }

  // Use drizzle's inArray for the pre-count (handles uuid serialization properly).
  let preLinkCount = 0;
  let preQueueCount = 0;
  const BATCH_FOR_COUNT = 500;
  for (let i = 0; i < toSkipIds.length; i += BATCH_FOR_COUNT) {
    const chunk = toSkipIds.slice(i, i + BATCH_FOR_COUNT);
    const lc = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(videoCourses)
      .where(inArray(videoCourses.videoId, chunk));
    const qc = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(extractionReviewQueue)
      .where(inArray(extractionReviewQueue.videoId, chunk));
    preLinkCount += lc[0]?.count ?? 0;
    preQueueCount += qc[0]?.count ?? 0;
  }
  console.log(
    `\nWill delete: ${preLinkCount} video_courses rows, ${preQueueCount} review-queue rows`,
  );
  console.log(`Will mark: ${toSkipIds.length} videos as extraction_model='skipped:cleanup'`);

  if (args.dryRun) {
    console.log("\n(dry run — no rows touched)");
    return;
  }

  // Delete in batches to keep query parameters under driver limits.
  const BATCH = 500;
  let linksDeleted = 0;
  let queueDeleted = 0;
  let videosMarked = 0;

  for (let i = 0; i < toSkipIds.length; i += BATCH) {
    const chunk = toSkipIds.slice(i, i + BATCH);
    const ldr = await db.delete(videoCourses).where(inArray(videoCourses.videoId, chunk));
    const qdr = await db
      .delete(extractionReviewQueue)
      .where(inArray(extractionReviewQueue.videoId, chunk));
    const vmr = await db
      .update(videos)
      .set({ extractionModel: "skipped:cleanup" })
      .where(inArray(videos.id, chunk));
    linksDeleted += (ldr as { rowCount?: number }).rowCount ?? 0;
    queueDeleted += (qdr as { rowCount?: number }).rowCount ?? 0;
    videosMarked += (vmr as { rowCount?: number }).rowCount ?? 0;
    process.stdout.write(`\r  processed ${Math.min(i + BATCH, toSkipIds.length)}/${toSkipIds.length}   `);
  }
  process.stdout.write("\n");

  console.log(
    `\nDone. links_deleted=${linksDeleted}, queue_deleted=${queueDeleted}, videos_marked=${videosMarked}.`,
  );
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
