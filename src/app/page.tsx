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
  const [
    coursesCount,
    curatedCount,
    coursesWithVideosCount,
    channelsCount,
    videosCount,
    extractedCount,
    videoCoursesCount,
    reviewQueueCount,
    captionsCount,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(courses),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(courses)
      .where(eq(courses.isCurated, true)),
    db
      .select({ count: sql<number>`count(distinct course_id)::int` })
      .from(videoCourses),
    db.select({ count: sql<number>`count(*)::int` }).from(channels),
    db.select({ count: sql<number>`count(*)::int` }).from(videos),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(videos)
      .where(sql`extracted_at IS NOT NULL`),
    db.select({ count: sql<number>`count(*)::int` }).from(videoCourses),
    db.select({ count: sql<number>`count(*)::int` }).from(extractionReviewQueue),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(videos)
      .where(sql`captions_text IS NOT NULL AND length(captions_text) > 0`),
  ]);

  const featured = await db
    .select({ slug: courses.slug, name: courses.name, state: courses.state })
    .from(courses)
    .where(eq(courses.isCurated, true))
    .orderBy(courses.name)
    .limit(8);

  const channelRows = await db
    .select({
      id: channels.id,
      handle: channels.handle,
      name: channels.name,
      subscriberCt: channels.subscriberCt,
      videoCount: sql<number>`count(${videos.id})::int`,
    })
    .from(channels)
    .leftJoin(videos, eq(videos.channelId, channels.id))
    .groupBy(channels.id)
    .orderBy(desc(sql<number>`count(${videos.id})::int`));

  const recent = await db
    .select({
      id: videos.id,
      ytVideoId: videos.ytVideoId,
      title: videos.title,
      publishedAt: videos.publishedAt,
      thumbnailUrl: videos.thumbnailUrl,
      channelName: channels.name,
    })
    .from(videos)
    .leftJoin(channels, eq(channels.id, videos.channelId))
    .orderBy(desc(videos.publishedAt))
    .limit(12);

  return {
    counts: {
      courses: coursesCount[0]?.count ?? 0,
      curated: curatedCount[0]?.count ?? 0,
      coursesWithVideos: coursesWithVideosCount[0]?.count ?? 0,
      channels: channelsCount[0]?.count ?? 0,
      videos: videosCount[0]?.count ?? 0,
      extracted: extractedCount[0]?.count ?? 0,
      videoCourses: videoCoursesCount[0]?.count ?? 0,
      reviewQueue: reviewQueueCount[0]?.count ?? 0,
      captions: captionsCount[0]?.count ?? 0,
    },
    featured,
    channels: channelRows,
    recent,
  };
}

function formatSubs(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default async function Home() {
  const { counts, featured, channels: channelList, recent } = await getOverview();

  const rows: { label: string; value: number; emphasis?: boolean }[] = [
    { label: "Courses with videos indexed", value: counts.coursesWithVideos, emphasis: true },
    { label: "Video↔Course links", value: counts.videoCourses },
    { label: "Videos extracted", value: counts.extracted },
    { label: "Videos with captions", value: counts.captions },
    { label: "Pending review queue", value: counts.reviewQueue },
    { label: "Courses (curated)", value: counts.curated },
    { label: "Courses (total)", value: counts.courses },
    { label: "Channels", value: counts.channels },
    { label: "Videos", value: counts.videos },
  ];

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <header className="mb-12 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Golf YouTube Search
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Find golf videos by course.
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Index the courses out of video titles, descriptions, and captions
            so you can actually search for them. Real search lands in M5; this
            is the catalog state.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            Index
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((row) => (
                <li
                  key={row.label}
                  className={`flex items-center justify-between px-5 ${row.emphasis ? "py-4" : "py-3"} text-sm`}
                >
                  <span
                    className={
                      row.emphasis
                        ? "font-medium text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-700 dark:text-zinc-300"
                    }
                  >
                    {row.label}
                  </span>
                  <span
                    className={`font-mono tabular-nums ${
                      row.emphasis
                        ? "text-lg text-emerald-600 dark:text-emerald-400"
                        : "text-zinc-900 dark:text-zinc-50"
                    }`}
                  >
                    {row.value.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {channelList.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Channels indexed
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {channelList.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {c.name}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                      {c.videoCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                    <span className="truncate font-mono">{c.handle ?? ""}</span>
                    <span>{formatSubs(c.subscriberCt)} subs</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Recently ingested
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {recent.map((v) => (
                <li
                  key={v.id}
                  className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${v.ytVideoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {v.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="aspect-video w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="px-3 py-2">
                      <p className="line-clamp-2 text-xs font-medium text-zinc-900 dark:text-zinc-50">
                        {v.title}
                      </p>
                      <p className="mt-1 flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-500">
                        <span className="truncate">{v.channelName ?? ""}</span>
                        <span>{formatDate(v.publishedAt)}</span>
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {featured.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Try a course
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          </section>
        )}
      </div>
    </main>
  );
}
