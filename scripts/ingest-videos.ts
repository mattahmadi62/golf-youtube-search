import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql } from "drizzle-orm";
import { channels, videos } from "../src/db/schema";
import {
  getChannel,
  getVideoDetails,
  iterateVideoIds,
  uploadsPlaylistId,
} from "../src/lib/youtube/client";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

type ChannelSeed = {
  ytChannelId: string;
  handle: string;
  name: string;
};

async function loadChannelSeeds(): Promise<ChannelSeed[]> {
  const file = path.resolve(process.cwd(), "data/channels.json");
  return JSON.parse(await readFile(file, "utf8")) as ChannelSeed[];
}

async function ingestChannel(
  db: ReturnType<typeof drizzle>,
  seed: ChannelSeed,
): Promise<{ videoCount: number; durationMs: number }> {
  const start = Date.now();
  console.log(`\n=== ${seed.name} (${seed.handle}) ===`);

  // 1. Refresh channel snippet + stats and upsert.
  const info = await getChannel(seed.ytChannelId);
  const [channelRow] = await db
    .insert(channels)
    .values({
      ytChannelId: info.id,
      handle: info.handle ?? seed.handle,
      name: info.name,
      subscriberCt: info.subscriberCount,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: channels.ytChannelId,
      set: {
        handle: info.handle ?? seed.handle,
        name: info.name,
        subscriberCt: info.subscriberCount,
        lastSyncedAt: new Date(),
      },
    })
    .returning({ id: channels.id });
  const channelId = channelRow.id;
  console.log(`  channel row: ${channelId}`);

  // 2. List every video ID in the uploads playlist.
  const playlistId = uploadsPlaylistId(info.id);
  const allVideoIds: string[] = [];
  for await (const vid of iterateVideoIds(playlistId)) {
    allVideoIds.push(vid);
  }
  console.log(`  found ${allVideoIds.length} videos in uploads playlist`);

  // 3. Fetch full video details in chunks of 50 and upsert.
  let inserted = 0;
  const FETCH_CHUNK = 50;
  const DB_CHUNK = 100;
  for (let i = 0; i < allVideoIds.length; i += FETCH_CHUNK) {
    const slice = allVideoIds.slice(i, i + FETCH_CHUNK);
    const details = await getVideoDetails(slice);
    if (details.length === 0) continue;

    // Batch the upsert. Splitting into DB_CHUNK rows keeps the SQL parameter
    // count from blowing past Neon HTTP's limits.
    for (let j = 0; j < details.length; j += DB_CHUNK) {
      const rows = details.slice(j, j + DB_CHUNK).map((d) => ({
        ytVideoId: d.id,
        channelId,
        title: d.title,
        description: d.description,
        publishedAt: new Date(d.publishedAt),
        durationS: d.durationSec,
        thumbnailUrl: d.thumbnailUrl,
        viewCount: d.viewCount,
      }));
      await db
        .insert(videos)
        .values(rows)
        .onConflictDoUpdate({
          target: videos.ytVideoId,
          set: {
            title: sql`EXCLUDED.title`,
            description: sql`EXCLUDED.description`,
            thumbnailUrl: sql`EXCLUDED.thumbnail_url`,
            viewCount: sql`EXCLUDED.view_count`,
            durationS: sql`EXCLUDED.duration_s`,
          },
        });
      inserted += rows.length;
    }
    process.stdout.write(`\r  upserted ${inserted}/${allVideoIds.length}`);
  }
  process.stdout.write("\n");

  return { videoCount: allVideoIds.length, durationMs: Date.now() - start };
}

async function main() {
  const arg = process.argv[2];
  const all = await loadChannelSeeds();
  const targets = arg
    ? all.filter(
        (c) =>
          c.handle === arg ||
          c.handle === `@${arg.replace(/^@/, "")}` ||
          c.ytChannelId === arg,
      )
    : all;
  if (targets.length === 0) {
    throw new Error(`No matching channel for arg "${arg}"`);
  }

  const sqlClient = neon(DATABASE_URL!);
  const db = drizzle({ client: sqlClient });

  console.log(`Ingesting ${targets.length} channel(s)...`);
  const summary: Array<{ name: string; videos: number; seconds: number }> = [];
  for (const seed of targets) {
    try {
      const r = await ingestChannel(db, seed);
      summary.push({
        name: seed.name,
        videos: r.videoCount,
        seconds: Math.round(r.durationMs / 1000),
      });
    } catch (err) {
      console.error(`  ERROR for ${seed.name}: ${String(err).slice(0, 300)}`);
    }
  }

  console.log("\n=== summary ===");
  for (const s of summary) {
    console.log(`  ${s.name}: ${s.videos} videos in ${s.seconds}s`);
  }
  const totalVideos = await db.select({ count: sql<number>`count(*)::int` }).from(videos);
  const totalChannels = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(channels);
  console.log(`\nDB now: ${totalChannels[0]?.count} channels, ${totalVideos[0]?.count} videos`);
}

main().catch((err) => {
  console.error("Ingest failed:", err);
  process.exit(1);
});
