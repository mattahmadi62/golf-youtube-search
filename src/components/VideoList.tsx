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

const SANS = { fontFamily: "var(--font-geist-sans)" } as const;

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
        <div className="mb-5 flex flex-wrap gap-2" style={SANS}>
          <button
            type="button"
            onClick={() => setChannelFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              channelFilter === null
                ? "border-[#1F4D32] bg-[#1F4D32] text-[#F4F1EA]"
                : "border-[#1F4D32]/25 bg-white/60 text-[#1F2A20] hover:border-[#1F4D32] hover:bg-white"
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
                    ? "border-[#1F4D32] bg-[#1F4D32] text-[#F4F1EA]"
                    : "border-[#1F4D32]/25 bg-white/60 text-[#1F2A20] hover:border-[#1F4D32] hover:bg-white"
                }`}
              >
                {c} ({count})
              </button>
            );
          })}
        </div>
      )}

      <ul className="space-y-3" style={SANS}>
        {filtered.map((v) => {
          const isPlaying = playingId === v.ytVideoId;
          return (
            <li
              key={v.ytVideoId}
              className="overflow-hidden rounded-xl border border-[#1F4D32]/15 bg-white/70"
            >
              {isPlaying ? (
                <>
                  <div className="aspect-video w-full bg-black">
                    <iframe
                      src={`https://www.youtube.com/embed/${v.ytVideoId}?autoplay=1`}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <a
                        href={`https://www.youtube.com/watch?v=${v.ytVideoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm font-medium leading-snug text-[#1F2A20] hover:text-[#1F4D32]"
                      >
                        {v.title}
                      </a>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#3A3A33]">
                        <span className="truncate">{v.channelName ?? "—"}</span>
                        <span>·</span>
                        <span>{formatDate(v.publishedAt)}</span>
                        {showMatchedCourse && v.matchedCourseName && v.matchedCourseSlug && (
                          <>
                            <span>·</span>
                            <a
                              href={`/course/${v.matchedCourseSlug}`}
                              className="rounded bg-[#1F4D32]/10 px-1.5 py-0.5 text-[#1F4D32] hover:bg-[#1F4D32]/20"
                            >
                              {v.matchedCourseName}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlayingId(null)}
                      className="shrink-0 rounded-md border border-[#1F4D32]/25 bg-white/60 px-2 py-1 text-xs text-[#1F2A20] hover:border-[#1F4D32] hover:bg-white"
                      aria-label="Collapse video"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-stretch gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setPlayingId(v.ytVideoId)}
                    className="group relative block aspect-video w-40 shrink-0 overflow-hidden rounded bg-[#F4F1EA] sm:w-48"
                  >
                    {v.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="white"
                          className="ml-0.5 h-4 w-4"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </button>
                  <div className="min-w-0 flex-1 self-center">
                    <a
                      href={`https://www.youtube.com/watch?v=${v.ytVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 block text-sm font-medium leading-snug text-[#1F2A20] hover:text-[#1F4D32]"
                    >
                      {v.title}
                    </a>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#3A3A33]">
                      <span className="truncate">{v.channelName ?? "—"}</span>
                      <span>·</span>
                      <span>{formatDate(v.publishedAt)}</span>
                      {showMatchedCourse && v.matchedCourseName && v.matchedCourseSlug && (
                        <>
                          <span>·</span>
                          <a
                            href={`/course/${v.matchedCourseSlug}`}
                            className="rounded bg-[#1F4D32]/10 px-1.5 py-0.5 text-[#1F4D32] hover:bg-[#1F4D32]/20"
                          >
                            {v.matchedCourseName}
                          </a>
                        </>
                      )}
                    </p>
                    {v.evidence && (
                      <p className="mt-1.5 line-clamp-1 text-xs italic text-[#3A3A33]">
                        “{v.evidence}”
                      </p>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && channelFilter && (
        <p className="text-sm text-[#3A3A33]" style={SANS}>
          No videos from {channelFilter} for this course.
        </p>
      )}
    </>
  );
}
