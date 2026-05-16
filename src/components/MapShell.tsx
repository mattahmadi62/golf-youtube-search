"use client";

import dynamic from "next/dynamic";
import type { MapCourse } from "./CourseMap";

const CourseMap = dynamic(
  () => import("./CourseMap").then((m) => m.CourseMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-500">
        Loading map…
      </div>
    ),
  },
);

export function MapShell({ courses }: { courses: MapCourse[] }) {
  return <CourseMap courses={courses} />;
}
