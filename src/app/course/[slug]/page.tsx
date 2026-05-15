import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { courses } from "@/db/schema";

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

  const location = [course.state, course.country].filter(Boolean).join(", ");

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          ← Home
        </Link>

        <div className="mt-8">
          <div className="flex items-center gap-2">
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

        <div className="mt-12 rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            No videos indexed yet.
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            M3 will start ingesting YouTube channels; this page will fill in.
          </p>
        </div>

        {(course.lat || course.lng) && (
          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
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
