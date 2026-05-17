import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoList } from "@/components/VideoList";
import {
  Divider,
  SectionLabel,
  TopographicPattern,
  YardageHeader,
} from "@/components/yardage";
import { db } from "@/db";
import { channels, courses, videoCourses, videos } from "@/db/schema";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

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
    <main
      className="relative min-h-dvh overflow-x-hidden"
      style={{
        backgroundColor: "#F4F1EA",
        color: "#1F2A20",
        fontFamily: "var(--font-fraunces)",
      }}
    >
      <TopographicPattern />

      <div className="relative">
        <YardageHeader />

        {/* ─── course hero ─── */}
        <section className="mx-auto max-w-4xl px-6 pb-12 pt-12 sm:pt-16">
          <SectionLabel>
            {isResort ? "Resort" : parent ? `Part of ${parent.name}` : "Course"}
          </SectionLabel>

          {parent && (
            <p
              className="mt-4 text-sm"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <Link
                href={`/course/${parent.slug}`}
                className="text-[#1F4D32] underline-offset-4 hover:underline"
              >
                ← {parent.name}
              </Link>
            </p>
          )}

          <h1 className="mt-6 text-4xl leading-[1.05] tracking-tight text-[#1F2A20] sm:text-5xl md:text-6xl">
            {course.name}
          </h1>

          {location && (
            <p className="mt-3 text-xl italic leading-snug text-[#1F4D32]/85 sm:text-2xl">
              {location}
            </p>
          )}

          {(isResort ||
            course.isCurated ||
            course.accessType ||
            course.holeCount) && (
            <div
              className="mt-6 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              {isResort && (
                <span className="rounded-full border border-[#1F4D32]/25 bg-white/50 px-3 py-1 text-[#1F4D32]">
                  Resort · {children.length} courses
                </span>
              )}
              {course.isCurated && (
                <span className="rounded-full border border-[#1F4D32]/25 bg-white/50 px-3 py-1 text-[#1F4D32]">
                  Curated
                </span>
              )}
              {course.accessType && (
                <span className="rounded-full border border-[#1F4D32]/25 bg-white/50 px-3 py-1 capitalize text-[#1F4D32]">
                  {course.accessType.replace("-", " ")}
                </span>
              )}
              {course.holeCount && (
                <span className="rounded-full border border-[#1F4D32]/25 bg-white/50 px-3 py-1 text-[#1F4D32]">
                  {course.holeCount} holes
                </span>
              )}
            </div>
          )}

          {course.aliases.length > 0 && (
            <p
              className="mt-4 text-xs text-[#3A3A33]"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              Also known as: {course.aliases.join(", ")}
            </p>
          )}

          {course.description && (
            <p
              className="mt-6 max-w-2xl text-base leading-relaxed text-[#3A3A33] sm:text-lg"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              {course.description}
            </p>
          )}

          {(course.address || course.phone || course.website) && (
            <dl
              className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 rounded-xl border border-[#1F4D32]/15 bg-white/60 p-5 text-sm sm:grid-cols-2"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              {course.address && (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-[#1F4D32]">
                    Address
                  </dt>
                  <dd className="mt-1 text-[#1F2A20]">{course.address}</dd>
                </div>
              )}
              {course.phone && (
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-[#1F4D32]">
                    Phone
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={`tel:${course.phone.replace(/\s+/g, "")}`}
                      className="text-[#1F2A20] underline-offset-4 hover:text-[#1F4D32] hover:underline"
                    >
                      {course.phone}
                    </a>
                  </dd>
                </div>
              )}
              {course.website && (
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-[#1F4D32]">
                    Website
                  </dt>
                  <dd className="mt-1 truncate">
                    <a
                      href={course.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1F4D32] underline-offset-4 hover:underline"
                    >
                      {course.website
                        .replace(/^https?:\/\//, "")
                        .replace(/\/$/, "")}
                      <span className="ml-1 inline-block translate-y-[-1px] text-xs">
                        ↗
                      </span>
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </section>

        {/* ─── children courses (if resort) ─── */}
        {children.length > 0 && (
          <>
            <Divider />
            <section className="mx-auto max-w-4xl px-6 py-12">
              <SectionLabel>Courses at this resort</SectionLabel>
              <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {children.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/course/${c.slug}`}
                      className="group flex items-baseline justify-between gap-4 rounded-xl border border-[#1F4D32]/15 bg-white/60 px-5 py-4 transition-all hover:border-[#1F4D32] hover:bg-white"
                    >
                      <span className="truncate text-base font-medium text-[#1F2A20] group-hover:text-[#1F4D32]">
                        {c.name}
                      </span>
                      <span
                        className="shrink-0 font-mono text-xs tabular-nums text-[#1F4D32]"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        {c.videoCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {/* ─── siblings (if sub-course of a resort) ─── */}
        {siblings.length > 0 && (
          <>
            <Divider />
            <section className="mx-auto max-w-4xl px-6 py-12">
              <SectionLabel>
                Other courses at {parent?.name ?? "this resort"}
              </SectionLabel>
              <ul
                className="mt-6 flex flex-wrap gap-2"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                {siblings.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/course/${s.slug}`}
                      className="rounded-full border border-[#1F4D32]/25 bg-white/60 px-3 py-1 text-xs text-[#1F2A20] transition-colors hover:border-[#1F4D32] hover:bg-white"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {/* ─── indexed videos ─── */}
        <Divider />
        <section className="mx-auto max-w-4xl px-6 py-12">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Videos at this course</SectionLabel>
            {indexed.length > 0 && (
              <span
                className="font-mono text-xs tabular-nums text-[#1F4D32]"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {indexed.length}
              </span>
            )}
          </div>

          {indexed.length === 0 ? (
            <div
              className="mt-6 rounded-xl border border-dashed border-[#1F4D32]/25 bg-white/40 p-8 text-center"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <p className="text-sm font-medium text-[#1F2A20]">
                No videos indexed yet.
              </p>
              <p className="mt-2 text-xs text-[#3A3A33]">
                Either nothing extracted yet for this course, or our channels
                haven&apos;t covered it.
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <VideoList
                videos={indexed.map((v) => ({
                  ytVideoId: v.ytVideoId,
                  title: v.title,
                  publishedAt: v.publishedAt,
                  thumbnailUrl: v.thumbnailUrl,
                  channelName: v.channelName,
                  evidence: v.evidence,
                  matchedCourseName: v.matchedCourseName,
                  matchedCourseSlug: v.matchedCourseSlug,
                }))}
                showMatchedCourse={isResort}
              />
            </div>
          )}
        </section>

        {/* ─── footer with report-bad-match ─── */}
        {indexed.length > 0 && (
          <>
            <Divider />
            <section
              className="mx-auto max-w-4xl px-6 py-10"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              <p className="text-xs text-[#3A3A33]">
                Spot a video that wasn&apos;t actually filmed here?{" "}
                <a
                  href={`mailto:feedback@caddiereel.com?subject=${encodeURIComponent(
                    `Bad match on ${course.name}`,
                  )}&body=${encodeURIComponent(
                    `Course: ${course.name}\nURL: https://caddiereel.com/course/${course.slug}\n\nWhich video is wrong (paste the YouTube link), and why:\n\n`,
                  )}`}
                  className="font-medium text-[#1F4D32] underline-offset-4 hover:underline"
                >
                  Report a bad match
                </a>
                .
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
