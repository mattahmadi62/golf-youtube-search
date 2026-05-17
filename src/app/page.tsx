import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import type { MapCourse } from "@/components/CourseMap";
import { MapShell } from "@/components/MapShell";
import { SearchBox } from "@/components/SearchBox";
import { Divider, SectionLabel } from "@/components/yardage";
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

  // Featured: top-level curated courses with the most indexed videos.
  const featured = await db
    .select({
      slug: courses.slug,
      name: courses.name,
      state: courses.state,
      country: courses.country,
      videoCount: sql<number>`(SELECT count(*)::int FROM video_courses WHERE course_id = ${courses.id})`,
    })
    .from(courses)
    .where(and(eq(courses.isCurated, true), isNull(courses.parentCourseId)))
    .orderBy(
      desc(sql<number>`(SELECT count(*)::int FROM video_courses WHERE course_id = ${courses.id})`),
      courses.name,
    )
    .limit(12);

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
    .innerJoin(videoCourses, eq(videoCourses.videoId, videos.id))
    .leftJoin(channels, eq(channels.id, videos.channelId))
    .groupBy(videos.id, channels.name)
    .orderBy(desc(videos.publishedAt))
    .limit(8);

  const mapCourses = (await db.execute(sql`
    SELECT
      c.id, c.slug, c.name, c.state, c.country,
      c.lat::float8 AS lat, c.lng::float8 AS lng,
      c.is_curated AS "isCurated",
      (SELECT COUNT(*)::int FROM video_courses WHERE course_id = c.id) AS "videoCount"
    FROM courses c
    WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND EXISTS (SELECT 1 FROM video_courses WHERE course_id = c.id)
    ORDER BY "videoCount" DESC
  `)) as unknown as { rows: MapCourse[] };

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
    mapCourses: mapCourses.rows,
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
  const { counts, featured, channels: channelList, recent, mapCourses } = await getOverview();

  // The four headline numbers — chosen to convey scale + signal.
  const headline = [
    { label: "Courses indexed", value: counts.coursesWithVideos.toLocaleString() },
    { label: "Video↔Course links", value: counts.videoCourses.toLocaleString() },
    { label: "Videos extracted", value: counts.extracted.toLocaleString() },
    { label: "Channels", value: counts.channels.toString() },
  ];

  return (
    <main
      className="relative min-h-dvh overflow-x-hidden"
      style={{
        backgroundColor: "#F4F1EA",
        color: "#1F2A20",
        fontFamily: "var(--font-fraunces)",
      }}
    >
      {/* hairline topographic contour pattern */}
      <svg
        aria-hidden
        className="pointer-events-none fixed inset-0 h-full w-full opacity-[0.045]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="topo-bg" width="160" height="80" patternUnits="userSpaceOnUse">
            <path
              d="M0,40 Q40,12 80,40 T160,40"
              stroke="#1F4D32"
              fill="none"
              strokeWidth="0.6"
            />
            <path
              d="M0,65 Q40,37 80,65 T160,65"
              stroke="#1F4D32"
              fill="none"
              strokeWidth="0.6"
            />
            <path
              d="M0,15 Q40,-12 80,15 T160,15"
              stroke="#1F4D32"
              fill="none"
              strokeWidth="0.6"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#topo-bg)" />
      </svg>

      <div className="relative">
        {/* ─── top bar ─── */}
        <header className="mx-auto flex max-w-6xl items-baseline justify-between px-6 pt-8 sm:pt-10">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#1F4D32]"
          >
            CaddieReel
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/map"
              className="text-[#1F2A20]/80 underline-offset-4 hover:text-[#1F4D32] hover:underline"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              Map
            </Link>
            <Link
              href="#channels"
              className="text-[#1F2A20]/80 underline-offset-4 hover:text-[#1F4D32] hover:underline"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              Channels
            </Link>
            <Link
              href="#featured"
              className="text-[#1F2A20]/80 underline-offset-4 hover:text-[#1F4D32] hover:underline"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              Courses
            </Link>
          </nav>
        </header>

        {/* ─── hero ─── */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <p
            className="text-[11px] uppercase tracking-[0.32em] text-[#1F4D32]"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            The course is the content
          </p>

          <h1 className="mt-8 max-w-4xl text-5xl leading-[1.04] tracking-tight text-[#1F2A20] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
            Find golf videos
            <br />
            by{" "}
            <em className="font-normal italic text-[#1F4D32]">course</em>.
          </h1>

          <p className="mt-6 max-w-2xl text-xl italic leading-snug text-[#1F4D32]/85 sm:text-2xl">
            Because the course is the story.
          </p>

          <p
            className="mt-8 max-w-xl text-lg leading-relaxed text-[#3A3A33]"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            CaddieReel reads titles, descriptions, and auto-captions across the
            biggest golf channels on YouTube — so when you search a course you
            find every round actually played there, not just videos that happen
            to name it.
          </p>

          <div className="mt-10 max-w-2xl">
            <SearchBox />
          </div>

          {/* headline stats */}
          <div className="mt-20 grid grid-cols-2 gap-x-10 gap-y-10 sm:gap-x-16 md:grid-cols-4">
            {headline.map((s, i) => (
              <div
                key={s.label}
                className={`${i !== 0 ? "md:border-l md:border-[#1F4D32]/15 md:pl-8" : ""}`}
              >
                <p className="text-5xl tracking-tight text-[#1F4D32] sm:text-6xl">
                  {s.value}
                </p>
                <p
                  className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#3A3A33]"
                  style={{ fontFamily: "var(--font-geist-sans)" }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── divider ─── */}
        <Divider />

        {/* ─── featured courses ─── */}
        {featured.length > 0 && (
          <section id="featured" className="mx-auto max-w-6xl px-6 py-20">
            <SectionLabel>On the bag this week</SectionLabel>
            <h2 className="mt-3 max-w-3xl text-3xl leading-tight text-[#1F2A20] sm:text-4xl md:text-5xl">
              Famous-name courses, indexed by where they actually got{" "}
              <em className="font-normal italic text-[#1F4D32]">played</em>.
            </h2>

            <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/course/${c.slug}`}
                    className="group flex h-full items-baseline justify-between gap-4 rounded-xl border border-[#1F4D32]/15 bg-white/60 px-5 py-5 transition-all hover:border-[#1F4D32] hover:bg-white"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-lg font-medium text-[#1F2A20] group-hover:text-[#1F4D32]">
                        {c.name}
                      </span>
                      <span
                        className="mt-1 block text-[11px] uppercase tracking-[0.18em] text-[#3A3A33]"
                        style={{ fontFamily: "var(--font-geist-sans)" }}
                      >
                        {[c.state, c.country !== "US" ? c.country : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </div>
                    <span
                      className="shrink-0 font-mono text-xs tabular-nums text-[#1F4D32]"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {c.videoCount > 0 ? c.videoCount : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Divider />

        {/* ─── manifesto ─── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionLabel>Why courses?</SectionLabel>
          <h2 className="mt-3 max-w-3xl text-3xl leading-tight text-[#1F2A20] sm:text-4xl md:text-5xl">
            In golf, the course is the{" "}
            <em className="font-normal italic text-[#1F4D32]">star</em>.
          </h2>
          <div
            className="mt-8 max-w-2xl space-y-5 text-base leading-relaxed text-[#3A3A33] sm:text-lg"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            <p>
              Augusta. St Andrews. Pinehurst No. 2. Pebble Beach. The majors
              prove it — golf is the rare sport where the venue is a character
              in its own right, not a backdrop. People tune in for the course
              as much as the leaderboard.
            </p>
            <p>
              Most golf sites index by player or channel. We do it the other
              way: every round, organized by where it was played — so you can
              follow the courses you love through the eyes of everyone who's
              filmed there.
            </p>
          </div>
        </section>

        <Divider />

        {/* ─── map ─── */}
        {mapCourses.length > 0 && (
          <section id="map" className="mx-auto max-w-6xl px-6 py-20">
            <SectionLabel>The territory</SectionLabel>
            <h2 className="mt-3 max-w-3xl text-3xl leading-tight text-[#1F2A20] sm:text-4xl md:text-5xl">
              Every course we've{" "}
              <em className="font-normal italic text-[#1F4D32]">indexed</em>,
              pinned where it is.
            </h2>
            <p
              className="mt-4 max-w-xl text-sm text-[#3A3A33]"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              {mapCourses.length.toLocaleString()} courses across the US, UK,
              and Ireland. Click any pin for the videos.
            </p>

            <div className="mt-10 h-[500px] overflow-hidden rounded-2xl border border-[#1F4D32]/15 bg-[#F4F1EA]">
              <MapShell courses={mapCourses} hideFilter />
            </div>

            <div className="mt-6">
              <Link
                href="/map"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#1F4D32] underline-offset-4 hover:underline"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                Explore the full map →
              </Link>
            </div>
          </section>
        )}

        <Divider />

        {/* ─── channels ─── */}
        {channelList.length > 0 && (
          <section id="channels" className="mx-auto max-w-6xl px-6 py-20">
            <SectionLabel>The roster</SectionLabel>
            <h2 className="mt-3 max-w-3xl text-3xl leading-tight text-[#1F2A20] sm:text-4xl md:text-5xl">
              Seven channels.{" "}
              <em className="font-normal italic text-[#1F4D32]">
                {counts.videos.toLocaleString()}
              </em>{" "}
              videos. Every course they played.
            </h2>

            <ul className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {channelList.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-[#1F4D32]/15 bg-white/60 px-5 py-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-base font-medium text-[#1F2A20]">
                      {c.name}
                    </span>
                    <span
                      className="shrink-0 font-mono text-xs tabular-nums text-[#1F4D32]"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {c.videoCount.toLocaleString()}
                    </span>
                  </div>
                  <div
                    className="mt-1 flex items-center justify-between gap-2 text-xs text-[#3A3A33]"
                    style={{ fontFamily: "var(--font-geist-sans)" }}
                  >
                    <span className="truncate font-mono">{c.handle ?? ""}</span>
                    <span>{formatSubs(c.subscriberCt)} subs</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Divider />

        {/* ─── recently indexed ─── */}
        {recent.length > 0 && (
          <section className="mx-auto max-w-6xl px-6 py-20">
            <SectionLabel>Fresh from the fairway</SectionLabel>
            <h2 className="mt-3 max-w-3xl text-3xl leading-tight text-[#1F2A20] sm:text-4xl md:text-5xl">
              Recently{" "}
              <em className="font-normal italic text-[#1F4D32]">indexed</em>.
            </h2>

            <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {recent.map((v) => (
                <li key={v.id}>
                  <a
                    href={`https://www.youtube.com/watch?v=${v.ytVideoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-lg border border-[#1F4D32]/15 bg-[#1F4D32]/5">
                      {v.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <p className="mt-3 line-clamp-2 text-base leading-snug text-[#1F2A20] group-hover:text-[#1F4D32]">
                      {v.title}
                    </p>
                    <p
                      className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#3A3A33]"
                      style={{ fontFamily: "var(--font-geist-sans)" }}
                    >
                      <span className="truncate">{v.channelName ?? ""}</span>
                      <span>·</span>
                      <span>{formatDate(v.publishedAt)}</span>
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Divider />

        {/* ─── footer ─── */}
        <footer className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-baseline">
            <div>
              <p className="text-xl text-[#1F2A20]">
                CaddieReel —{" "}
                <em className="italic text-[#1F4D32]">find golf by course</em>.
              </p>
              <p
                className="mt-2 text-xs uppercase tracking-[0.18em] text-[#3A3A33]"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                Built with Next.js, Postgres, Drizzle, and Claude Haiku 4.5
              </p>
            </div>
            <div
              className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#1F2A20]/80"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <Link href="/map" className="hover:text-[#1F4D32]">
                Course map
              </Link>
              <Link href="/admin/review" className="hover:text-[#1F4D32]">
                Review queue
              </Link>
              <a
                href="https://github.com/mattahmadi62/caddiereel"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#1F4D32]"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

