import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, sql } from "drizzle-orm";
import { channels, videos } from "../src/db/schema";
import { fetchCaptions, ytDlpAvailable } from "../src/lib/youtube/captions";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

type Args = {
  channel?: string; // @handle or channel ID
  limit?: number;
  concurrency: number;
  cookiesFromBrowser: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { concurrency: 6, cookiesFromBrowser: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--channel") out.channel = argv[++i];
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10);
    else if (a === "--concurrency") out.concurrency = parseInt(argv[++i], 10);
    else if (a === "--cookies-from-browser") out.cookiesFromBrowser = argv[++i];
    else if (a.startsWith("@")) out.channel = a;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  console.log(
    `Args: channel=${args.channel ?? "(all)"} limit=${args.limit ?? "(no limit)"} concurrency=${args.concurrency} cookies=${args.cookiesFromBrowser ?? "(none)"}`,
  );

  if (!(await ytDlpAvailable())) {
    console.error("yt-dlp is not on PATH. Install it: brew install yt-dlp");
    process.exit(1);
  }

  const sqlClient = neon(DATABASE_URL!);
  const db = drizzle({ client: sqlClient });

  // Resolve target channel (if any).
  let channelId: string | undefined;
  if (args.channel) {
    const row = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        args.channel.startsWith("@")
          ? eq(channels.handle, args.channel)
          : eq(channels.ytChannelId, args.channel),
      )
      .limit(1);
    if (row.length === 0) {
      console.error(`No channel found for "${args.channel}"`);
      process.exit(1);
    }
    channelId = row[0].id;
  }

  const whereClauses = [isNull(videos.captionsText)];
  if (channelId) whereClauses.push(eq(videos.channelId, channelId));

  const queue = await db
    .select({ id: videos.id, ytVideoId: videos.ytVideoId, title: videos.title })
    .from(videos)
    .where(and(...whereClauses))
    .limit(args.limit ?? 100_000);

  console.log(`Pending: ${queue.length} videos`);
  if (queue.length === 0) return;

  let done = 0;
  let withCaptions = 0;
  let noCaptions = 0;
  let failed = 0;
  const start = Date.now();

  // Worker pool — pulls from a shared index until the queue is drained.
  let next = 0;
  const worker = async (workerId: number) => {
    while (true) {
      const idx = next++;
      if (idx >= queue.length) return;
      const v = queue[idx];
      const result = await fetchCaptions(v.ytVideoId, {
        cookiesFromBrowser: args.cookiesFromBrowser,
      });
      if (result.text === null) {
        failed++;
      } else {
        await db
          .update(videos)
          .set({ captionsText: result.text })
          .where(eq(videos.id, v.id));
        if (result.text.length > 0) withCaptions++;
        else noCaptions++;
      }
      done++;
      if (done % 10 === 0 || done === queue.length) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = done / elapsed;
        const eta = Math.round((queue.length - done) / rate);
        process.stdout.write(
          `\r  done=${done}/${queue.length} captions=${withCaptions} empty=${noCaptions} failed=${failed} ${rate.toFixed(1)}/s eta=${eta}s   `,
        );
      }
    }
  };

  const workers = Array.from({ length: args.concurrency }, (_, i) => worker(i));
  await Promise.all(workers);
  process.stdout.write("\n");

  console.log(
    `\nDone in ${Math.round((Date.now() - start) / 1000)}s. captions=${withCaptions}, empty=${noCaptions}, failed=${failed}`,
  );

  const totalWith = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(videos)
    .where(sql`captions_text IS NOT NULL AND length(captions_text) > 0`);
  console.log(`Total videos with caption text: ${totalWith[0]?.count}`);
}

main().catch((err) => {
  console.error("Caption ingest failed:", err);
  process.exit(1);
});
