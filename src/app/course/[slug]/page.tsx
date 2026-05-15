import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { channels, courses, videoCourses, videos } from "@/db/schema";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

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

export default async function CoursePage({ params }: PageProps) {
  const { slug } = await params;

  const rows = await db
    .select()
    .from(courses)
    .where(eq(courses.slug, slug))
    .limit(1);

  const course = rows[0];
  if (!course) notFound();

  // Parent (if this is a sub-course) and children (if this is a resort).
  let parent: { name: string; slug: string } | null = null;
  if (course.parentCourseId) {
    const [p] = await db
      .select({ name: courses.name, slug: courses.slug })
      .from(courses)
      .where(eq(courses.id, course.parentCourseId))
      .limit(1);
    parent = p ?? null;
  }

  const children = await db
    .select({
      id: courses.id,
      name: courses.name,
      slug: courses.slug,
      videoCount: sql<number>`(SELECT count(*)::int FROM video_courses WHERE course_id = ${courses.id})`,
    })
    .from(courses)
    .where(eq(courses.parentCourseId, course.id))
    .orderBy(courses.name);

  // Siblings — same parent, excluding self.
  const siblings = course.parentCourseId
    ? await db
        .select({ name: courses.name, slug: courses.slug })
        .from(courses)
        .where(
          and(
            eq(courses.parentCourseId, course.parentCourseId),
            sql`${courses.id} != ${course.id}`,
          ),
        )
        .orderBy(courses.name)
    : [];

  // Aggregate videos across this course and any children (for resort pages).
  const courseIds = [course.id, ...children.map((c) => c.id)];
  const indexed = await db
    .select({
      ytVideoId: videos.ytVideoId,
      title: videos.title,
      publishedAt: videos.publishedAt,
      thumbnailUrl: videos.thumbnailUrl,
      channelName: channels.name,
      confidence: videoCourses.confidence,
      evidence: videoCourses.evidence,
      source: videoCourses.source,
      matchedCourseName: courses.name,
      matchedCourseSlug: courses.slug,
    })
    .from(videoCourses)
    .innerJoin(videos, eq(videos.id, videoCourses.videoId))
    .innerJoin(courses, eq(courses.id, videoCourses.courseId))
    .leftJoin(channels, eq(channels.id, videos.channelId))
    .where(inArray(videoCourses.courseId, courseIds))
    .orderBy(desc(videos.publishedAt));

  const location = [course.state, course.country].filter(Boolean).join(", ");
  const isResort = children.length > 0;

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Home
        </Link>

        {parent && (
          <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
            Part of{" "}
            <Link
              href={`/course/${parent.slug}`}
              className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {parent.name}
            </Link>
          </p>
        )}

        <div className={parent ? "mt-2" : "mt-8"}>
          <div className="flex items-center gap-2">
            {isResort && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Resort · {children.length} courses
              </span>
            )}
            {course.isCurated && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Curated
              </span>
            )}
            {course.osmId && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                OSM
              </span>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {course.name}
          </h1>
          {location && (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{location}</p>
          )}
          {course.aliases.length > 0 && (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
              Also known as: {course.aliases.join(", ")}
            </p>
          )}
        </div>

        {children.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Courses at this resort
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {children.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/course/${c.slug}`}
                    className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/30"
                  >
                    <span className="text-zinc-900 dark:text-zinc-50">{c.name}</span>
                    <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                      {c.videoCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {siblings.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Other courses at {parent?.name ?? "this resort"}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/course/${s.slug}`}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Indexed videos
            </h2>
            {indexed.length > 0 && (
              <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                {indexed.length}
              </span>
            )}
          </div>

          {indexed.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No videos indexed yet.
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Either nothing extracted yet for this course, or our channels
                haven&apos;t covered it.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {indexed.map((v) => (
                <li
                  key={v.ytVideoId}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${v.ytVideoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-4 p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    {v.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="aspect-video w-40 rounded object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                        {v.title}
                      </h3>
                      <p className="mt-1 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                        <span className="truncate">{v.channelName ?? "—"}</span>
                        <span>·</span>
                        <span>{formatDate(v.publishedAt)}</span>
                        {isResort && v.matchedCourseSlug !== course.slug && (
                          <>
                            <span>·</span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              {v.matchedCourseName}
                            </span>
                          </>
                        )}
                      </p>
                      {v.evidence && (
                        <p className="mt-2 line-clamp-2 text-xs italic text-zinc-500 dark:text-zinc-500">
                          “{v.evidence}”
                        </p>
                      )}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(course.lat || course.lng) && !isResort && (
          <dl className="mt-12 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-500">Latitude</dt>
              <dd className="mt-1 font-mono text-zinc-900 dark:text-zinc-50">
                {course.lat ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-500">Longitude</dt>
              <dd className="mt-1 font-mono text-zinc-900 dark:text-zinc-50">
                {course.lng ?? "—"}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </main>
  );
}
