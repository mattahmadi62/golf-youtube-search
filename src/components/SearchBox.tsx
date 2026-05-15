"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/app/api/search/route";

const DEBOUNCE_MS = 180;

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState<number>(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { results: SearchResult[] };
        setResults(json.results);
        setActive(json.results.length > 0 ? 0 : -1);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Keyboard ⌘K / Ctrl+K focuses input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function navigate(r: SearchResult) {
    setOpen(false);
    setQ("");
    router.push(`/course/${r.slug}`);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active >= 0 ? active : 0];
      if (r) navigate(r);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search by course — try Pebble, Saticoy, Pinehurst…"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          ⌘K
        </kbd>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          {loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-zinc-500">Searching…</div>
          )}
          {!loading && results.length === 0 && q.trim().length >= 2 && (
            <div className="px-4 py-3 text-sm text-zinc-500">
              No matches. Try a different course name.
            </div>
          )}
          {results.length > 0 && (
            <ul className="max-h-[60vh] overflow-y-auto">
              {results.map((r, i) => {
                const isActive = i === active;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => navigate(r)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                        isActive
                          ? "bg-emerald-50 dark:bg-emerald-950/30"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {r.name}
                          </span>
                          {r.is_curated && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Curated
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                          {r.state && <span>{r.state}</span>}
                          {r.parent_name && (
                            <>
                              {r.state && <span>·</span>}
                              <span>Part of {r.parent_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="ml-3 shrink-0 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                        {r.video_count > 0
                          ? `${r.video_count} ${r.video_count === 1 ? "video" : "videos"}`
                          : "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
