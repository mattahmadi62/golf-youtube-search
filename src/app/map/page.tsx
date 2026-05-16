import { sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import type { MapCourse } from "@/components/CourseMap";
import { MapShell } from "@/components/MapShell";

export const dynamic = "force-dynamic";

async function getCoursesForMap(): Promise<MapCourse[]> {
  const rows = (await db.execute(sql`
    SELECT
      c.id,
      c.slug,
      c.name,
      c.state,
      c.country,
      c.lat::float8 AS lat,
      c.lng::float8 AS lng,
      c.is_curated AS "isCurated",
      (SELECT COUNT(*)::int FROM video_courses WHERE course_id = c.id) AS "videoCount"
    FROM courses c
    WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND EXISTS (SELECT 1 FROM video_courses WHERE course_id = c.id)
    ORDER BY "videoCount" DESC
  `)) as unknown as { rows: MapCourse[] };
  return rows.rows;
}

export default async function MapPage() {
  const courses = await getCoursesForMap();

  return (
    <main className="flex h-dvh flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-black">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              ← Home
            </Link>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Courses on the map
            </h1>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Only courses with indexed videos.
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-4">
        <MapShell courses={courses} />
      </div>
    </main>
  );
}
