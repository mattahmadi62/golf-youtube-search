"use client";

import { useMemo, useState } from "react";

export type VideoListItem = {
  ytVideoId: string;
  title: string;
  publishedAt: Date | string | null;
  thumbnailUrl: string | null;
  channelName: string | null;
  evidence: string | null;
  matchedCourseName?: string;
  matchedCourseSlug?: string;
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

export function VideoList({
  videos,
  showMatchedCourse = false,
}: {
  videos: VideoListItem[];
  /** Resort pages: show which sub-course matched each video. */
  showMatchedCourse?: boolean;
}) {
  const channels = useMemo(() => {
    const set = new Set<string>();
    for (const v of videos) if (v.channelName) set.add(v.channelName);
    return Array.from(set).sort();
  }, [videos]);

  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!channelFilter) return videos;
    return videos.filter((v) => v.channelName === channelFilter);
  }, [videos, channelFilter]);

  return (
    <>
      {channels.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setChannelFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              channelFilter === null
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
            }`}
          >
            All ({videos.length})
          </button>
          {channels.map((c) => {
            const count = videos.filter((v) => v.channelName === c).length;
            const isActive = channelFilter === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setChannelFilter(c)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  isActive
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                }`}
              >
                {c} ({count})
              </button>
            );
          })}
        </div>
      )}

      <ul className="space-y-3">
        {filtered.map((v) => {
          const isPlaying = playingId === v.ytVideoId;
          return (
            <li
              key={v.ytVideoId}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            >
              {isPlaying ? (
                <div className="aspect-video w-full bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${v.ytVideoId}?autoplay=1`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full border-0"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPlayingId(v.ytVideoId)}
                  className="group block w-full"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                    {v.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 backdrop-blur-sm transition-transform group-hover:scale-110">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="white"
                          className="ml-1 h-6 w-6"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              )}

              <div className="px-4 py-3">
                <a
                  href={`https://www.youtube.com/watch?v=${v.ytVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-medium leading-snug text-zinc-900 hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
                >
                  {v.title}
                </a>
                <p className="mt-1 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                  <span className="truncate">{v.channelName ?? "—"}</span>
                  <span>·</span>
                  <span>{formatDate(v.publishedAt)}</span>
                  {showMatchedCourse && v.matchedCourseName && v.matchedCourseSlug && (
                    <>
                      <span>·</span>
                      <a
                        href={`/course/${v.matchedCourseSlug}`}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                      >
                        {v.matchedCourseName}
                      </a>
                    </>
                  )}
                </p>
                {v.evidence && (
                  <p className="mt-2 line-clamp-2 text-xs italic text-zinc-500 dark:text-zinc-500">
                    “{v.evidence}”
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && channelFilter && (
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          No videos from {channelFilter} for this course.
        </p>
      )}
    </>
  );
}
