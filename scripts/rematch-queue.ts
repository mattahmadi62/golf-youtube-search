/**
 * Walk the pending extraction review queue and re-run the matcher.
 *
 * Use this after editing `data/curated-courses.json` (adding aliases for
 * names that auto-captions mishear) and re-running `pnpm seed:curated`.
 * Rows that now match get a video_courses link and the queue entry is
 * marked resolved. No new LLM calls — this is purely a DB pass.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { extractionReviewQueue, videoCourses } from "../src/db/schema";
import { matchCourse } from "../src/lib/match";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

async function main() {
  const sqlClient = neon(DATABASE_URL!);
  const db = drizzle({ client: sqlClient });

  const queue = await db
    .select()
    .from(extractionReviewQueue)
    .where(eq(extractionReviewQueue.status, "pending"));

  console.log(`Pending review rows: ${queue.length}`);
  if (queue.length === 0) return;

  let resolved = 0;
  let stillUnmatched = 0;

  for (const row of queue) {
    const match = await matchCourse(db, row.candidateName);
    if (!match) {
      stillUnmatched++;
      continue;
    }

    // Link the video to the course; preserve the LLM evidence we stored.
    await db
      .insert(videoCourses)
      .values({
        videoId: row.videoId,
        courseId: match.courseId,
        confidence: (0.85 * match.confidence).toFixed(2),
        source: match.matchType,
        evidence: row.evidence,
      })
      .onConflictDoNothing();

    await db
      .update(extractionReviewQueue)
      .set({ status: "linked", resolvedCourseId: match.courseId })
      .where(
        and(
          eq(extractionReviewQueue.id, row.id),
          eq(extractionReviewQueue.status, "pending"),
        ),
      );

    resolved++;
    if (resolved % 10 === 0) {
      process.stdout.write(`\r  resolved=${resolved}/${queue.length}`);
    }
  }
  process.stdout.write("\n");

  console.log(`\nResolved ${resolved} review rows. Still unmatched: ${stillUnmatched}.`);
}

main().catch((err) => {
  console.error("Rematch failed:", err);
  process.exit(1);
});
