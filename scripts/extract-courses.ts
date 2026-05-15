import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { extractionReviewQueue, videoCourses, videos } from "../src/db/schema";
import { CourseExtractor, MODEL_ID } from "../src/lib/llm/extract";
import { matchCourse } from "../src/lib/match";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

type Args = {
  limit?: number;
  concurrency: number;
  dryRun: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { concurrency: 4, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = parseInt(argv[++i], 10);
    else if (a === "--concurrency") out.concurrency = parseInt(argv[++i], 10);
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  console.log(
    `Args: limit=${args.limit ?? "(none)"} concurrency=${args.concurrency} dryRun=${args.dryRun}`,
  );

  const sqlClient = neon(DATABASE_URL!);
  const db = drizzle({ client: sqlClient });

  const extractor = new CourseExtractor();

  // Eligible: have captions text (non-empty) AND not yet extracted.
  const queue = await db
    .select({
      id: videos.id,
      title: videos.title,
      description: videos.description,
      captionsText: videos.captionsText,
    })
    .from(videos)
    .where(
      and(
        isNull(videos.extractedAt),
        isNotNull(videos.captionsText),
        sql`length(${videos.captionsText}) > 100`,
      ),
    )
    .limit(args.limit ?? 100_000);

  console.log(`Pending: ${queue.length} videos`);
  if (queue.length === 0) return;

  let done = 0;
  let extracted = 0;
  let matched = 0;
  let queuedForReview = 0;
  let failed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  const start = Date.now();

  let next = 0;
  const worker = async () => {
    while (true) {
      const idx = next++;
      if (idx >= queue.length) return;
      const v = queue[idx];

      try {
        const result = await extractor.extract({
          title: v.title,
          description: v.description,
          captions: v.captionsText,
        });
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        totalCachedTokens += result.cachedTokens;
        extracted++;

        for (const candidate of result.courses) {
          if (candidate.confidence < 0.4) continue;
          const match = await matchCourse(db, candidate.name);
          if (match) {
            if (!args.dryRun) {
              await db
                .insert(videoCourses)
                .values({
                  videoId: v.id,
                  courseId: match.courseId,
                  confidence: (candidate.confidence * match.confidence).toFixed(2),
                  source: match.matchType,
                  evidence: candidate.evidence,
                })
                .onConflictDoNothing();
            }
            matched++;
          } else {
            if (!args.dryRun) {
              await db.insert(extractionReviewQueue).values({
                videoId: v.id,
                candidateName: candidate.name,
                evidence: candidate.evidence,
                status: "pending",
              });
            }
            queuedForReview++;
          }
        }

        if (!args.dryRun) {
          await db
            .update(videos)
            .set({ extractedAt: new Date(), extractionModel: MODEL_ID })
            .where(eq(videos.id, v.id));
        }
      } catch (err) {
        failed++;
        console.error(
          `\n  ERROR video=${v.id}: ${String(err).slice(0, 200)}`,
        );
      }

      done++;
      if (done % 5 === 0 || done === queue.length) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = done / elapsed;
        const eta = Math.round((queue.length - done) / rate);
        process.stdout.write(
          `\r  done=${done}/${queue.length} matched=${matched} review=${queuedForReview} failed=${failed} ${rate.toFixed(2)}/s eta=${eta}s   `,
        );
      }
    }
  };

  const workers = Array.from({ length: args.concurrency }, () => worker());
  await Promise.all(workers);
  process.stdout.write("\n");

  const seconds = Math.round((Date.now() - start) / 1000);
  console.log(`\nDone in ${seconds}s.`);
  console.log(`  extracted=${extracted}, matched=${matched}, review=${queuedForReview}, failed=${failed}`);

  // Cost estimate — Claude Haiku 4.5: $1/1M input (uncached), $0.1/1M cached read, $5/1M output.
  const cost =
    ((totalInputTokens - totalCachedTokens) * 1.0 +
      totalCachedTokens * 0.1 +
      totalOutputTokens * 5.0) /
    1_000_000;
  console.log(
    `  tokens: input=${totalInputTokens} (cached=${totalCachedTokens}), output=${totalOutputTokens} → ~$${cost.toFixed(2)}`,
  );

  if (args.dryRun) {
    console.log("\n(dry run — no rows written to video_courses or extraction_review_queue)");
  }
}

main().catch((err) => {
  console.error("\nExtraction failed:", err);
  process.exit(1);
});
