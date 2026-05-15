import { sql } from "drizzle-orm";
import { db } from "@/db";
import { channels, courses, extractionReviewQueue, videoCourses, videos } from "@/db/schema";

export const dynamic = "force-dynamic";

async function getTableCounts() {
  const [coursesCount, channelsCount, videosCount, videoCoursesCount, reviewQueueCount] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(courses),
      db.select({ count: sql<number>`count(*)::int` }).from(channels),
      db.select({ count: sql<number>`count(*)::int` }).from(videos),
      db.select({ count: sql<number>`count(*)::int` }).from(videoCourses),
      db.select({ count: sql<number>`count(*)::int` }).from(extractionReviewQueue),
    ]);

  return {
    courses: coursesCount[0]?.count ?? 0,
    channels: channelsCount[0]?.count ?? 0,
    videos: videosCount[0]?.count ?? 0,
    videoCourses: videoCoursesCount[0]?.count ?? 0,
    reviewQueue: reviewQueueCount[0]?.count ?? 0,
  };
}

export default async function Home() {
  const counts = await getTableCounts();
  const rows: { label: string; value: number }[] = [
    { label: "Courses", value: counts.courses },
    { label: "Channels", value: counts.channels },
    { label: "Videos", value: counts.videos },
    { label: "Video↔Course links", value: counts.videoCourses },
    { label: "Pending review queue", value: counts.reviewQueue },
  ];

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <div className="mb-12">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Golf YouTube Search
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            M1 — DB wiring sanity check
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            If you can read these numbers, Next.js is talking to Neon through Drizzle. Tables are
            empty; that's fine. M2 seeds the course catalog.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between px-5 py-4 text-sm"
              >
                <span className="text-zinc-700 dark:text-zinc-300">{row.label}</span>
                <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-50">
                  {row.value.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-xs text-zinc-500 dark:text-zinc-500">
          Schema: {Object.keys(counts).length} tables, queried at request time.
        </p>
      </div>
    </main>
  );
}
