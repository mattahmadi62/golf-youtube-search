import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import {
  channels,
  courses,
  extractionReviewQueue,
  videoCourses,
  videos,
} from "@/db/schema";

export const dynamic = "force-dynamic";

async function getOverview() {
  const [coursesCount, curatedCount, channelsCount, videosCount, videoCoursesCount, reviewQueueCount] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(courses),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(courses)
        .where(eq(courses.isCurated, true)),
      db.select({ count: sql<number>`count(*)::int` }).from(channels),
      db.select({ count: sql<number>`count(*)::int` }).from(videos),
      db.select({ count: sql<number>`count(*)::int` }).from(videoCourses),
      db.select({ count: sql<number>`count(*)::int` }).from(extractionReviewQueue),
    ]);

  const featured = await db
    .select({ slug: courses.slug, name: courses.name, state: courses.state })
    .from(courses)
    .where(eq(courses.isCurated, true))
    .orderBy(desc(courses.name))
    .limit(8);

  return {
    counts: {
      courses: coursesCount[0]?.count ?? 0,
      curated: curatedCount[0]?.count ?? 0,
      channels: channelsCount[0]?.count ?? 0,
      videos: videosCount[0]?.count ?? 0,
      videoCourses: videoCoursesCount[0]?.count ?? 0,
      reviewQueue: reviewQueueCount[0]?.count ?? 0,
    },
    featured,
  };
}

export default async function Home() {
  const { counts, featured } = await getOverview();

  const rows: { label: string; value: number }[] = [
    { label: "Courses (total)", value: counts.courses },
    { label: "Courses (curated)", value: counts.curated },
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
            Find golf videos by course.
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Index the courses out of video titles, descriptions, and captions so you can
            actually search for them. Real search lands in M5; this is the catalog.
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

        {featured.length > 0 && (
          <div className="mt-12">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Try a course
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {featured.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/course/${c.slug}`}
                    className="block rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/30"
                  >
                    <span className="text-zinc-900 dark:text-zinc-50">{c.name}</span>
                    {c.state && (
                      <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-500">
                        {c.state}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
