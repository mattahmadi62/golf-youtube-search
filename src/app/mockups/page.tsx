import Link from "next/link";

export const dynamic = "force-dynamic";

const STATS = [
  { label: "Courses indexed", value: "252" },
  { label: "Video↔Course links", value: "958" },
  { label: "Videos extracted", value: "5,155" },
  { label: "Channels", value: "7" },
];

const FEATURED = [
  "Pebble Beach Golf Links",
  "Augusta National",
  "Bandon Dunes Resort",
  "Solina Golf Club",
  "St Andrews Old Course",
  "Pinehurst Resort",
];

export default function MockupsIndex() {
  return (
    <main className="min-h-dvh bg-zinc-100 dark:bg-zinc-950">
      <div className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-black/60">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Design preview</p>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              CaddieReel — 4 directions
            </h1>
          </div>
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            ← Current site
          </Link>
        </div>
        <div className="mx-auto mt-2 flex max-w-6xl flex-wrap gap-2 text-xs">
          <a href="#yardage" className="rounded-full bg-zinc-100 px-3 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">1 · Yardage Book</a>
          <a href="#country-club" className="rounded-full bg-zinc-100 px-3 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">2 · Country Club Minimal</a>
          <a href="#bento" className="rounded-full bg-zinc-100 px-3 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">3 · Modern Sports Bento</a>
          <a href="#photo" className="rounded-full bg-zinc-100 px-3 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">4 · Photography-First</a>
        </div>
      </div>

      <YardageBook />
      <CountryClub />
      <ModernBento />
      <PhotoFirst />
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Direction 1 — Yardage Book                                              */
/* ────────────────────────────────────────────────────────────────────── */

function YardageBook() {
  return (
    <section
      id="yardage"
      className="relative overflow-hidden"
      style={{
        backgroundColor: "#F4F1EA",
        fontFamily: "var(--font-fraunces)",
      }}
    >
      {/* hairline topographic lines */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="topo" width="120" height="60" patternUnits="userSpaceOnUse">
            <path d="M0,30 Q30,10 60,30 T120,30" stroke="#1F4D32" fill="none" strokeWidth="0.5" />
            <path d="M0,50 Q30,30 60,50 T120,50" stroke="#1F4D32" fill="none" strokeWidth="0.5" />
            <path d="M0,10 Q30,-10 60,10 T120,10" stroke="#1F4D32" fill="none" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#topo)" />
      </svg>

      <div className="relative mx-auto max-w-5xl px-6 py-24">
        <Tag label="1 · Yardage Book" tone="forest" />
        <div className="mt-10">
          <p
            className="text-sm uppercase tracking-[0.3em]"
            style={{ color: "#1F4D32", letterSpacing: "0.3em" }}
          >
            CaddieReel
          </p>
          <h2
            className="mt-6 text-6xl leading-[1.05] tracking-tight md:text-7xl"
            style={{ color: "#1F2A20" }}
          >
            Find golf videos
            <br />
            by{" "}
            <em style={{ color: "#1F4D32", fontStyle: "italic" }}>course</em>.
          </h2>
          <p
            className="mt-6 max-w-xl text-lg leading-relaxed"
            style={{ color: "#3A3A33" }}
          >
            A reading of where golf actually got played. CaddieReel reads
            titles, descriptions, and auto-captions across seven channels and
            6,751 videos so you can find every round at Pebble, Bandon, or
            Solina.
          </p>

          <div
            className="mt-10 flex max-w-2xl items-center gap-3 rounded-full border bg-white px-6 py-4"
            style={{ borderColor: "#1F4D32", boxShadow: "0 1px 0 #1F4D32 inset" }}
          >
            <span style={{ color: "#1F4D32" }} className="text-lg">⌕</span>
            <span className="flex-1 text-base text-zinc-400">
              Search by course — Pebble, Saticoy, Pinehurst…
            </span>
            <kbd
              className="rounded px-1.5 py-0.5 font-mono text-xs"
              style={{ background: "#1F4D32", color: "#F4F1EA" }}
            >
              ⌘K
            </kbd>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-x-12 gap-y-8 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <p
                  className="text-5xl tracking-tight"
                  style={{ color: "#1F4D32", fontFamily: "var(--font-fraunces)" }}
                >
                  {s.value}
                </p>
                <p
                  className="mt-1 text-xs uppercase tracking-wider"
                  style={{ color: "#3A3A33", fontFamily: "var(--font-geist-sans)" }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16">
            <p
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: "#1F4D32", fontFamily: "var(--font-geist-sans)" }}
            >
              On the bag this week
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {FEATURED.map((f) => (
                <span
                  key={f}
                  className="rounded-full border px-4 py-2 text-sm"
                  style={{ borderColor: "#1F4D32", color: "#1F2A20", background: "rgba(255,255,255,0.5)" }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Direction 2 — Country Club Minimal                                      */
/* ────────────────────────────────────────────────────────────────────── */

function CountryClub() {
  return (
    <section
      id="country-club"
      className="relative"
      style={{ backgroundColor: "#FAFAF7" }}
    >
      <div className="mx-auto max-w-5xl px-6 py-24">
        <Tag label="2 · Country Club Minimal" tone="forest" />
        <div className="mt-10 grid grid-cols-1 gap-16 md:grid-cols-12">
          <div className="md:col-span-7">
            <p
              className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
              style={{ color: "#1F4D32" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "#C89968" }}
              />
              CaddieReel
            </p>
            <h2 className="mt-6 text-6xl font-semibold leading-[1.04] tracking-tight text-zinc-900">
              Find golf videos by course.
            </h2>
            <p className="mt-6 max-w-md text-lg text-zinc-600">
              Type any course name. CaddieReel pulls course mentions out of
              video titles, descriptions, and auto-captions across the biggest
              golf channels.
            </p>
            <div
              className="mt-10 flex max-w-xl items-center gap-3 rounded-lg border bg-white px-5 py-3.5"
              style={{ borderColor: "#E4E2D8" }}
            >
              <span className="text-zinc-400">⌕</span>
              <span className="flex-1 text-base text-zinc-400">
                Search by course — try Pebble, Saticoy, Pinehurst…
              </span>
              <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="md:col-span-5">
            <div
              className="rounded-2xl border bg-white p-8"
              style={{ borderColor: "#E4E2D8" }}
            >
              <p
                className="text-xs uppercase tracking-[0.18em] text-zinc-500"
              >
                Index
              </p>
              <dl className="mt-6 space-y-5">
                {STATS.map((s, i) => (
                  <div
                    key={s.label}
                    className={`flex items-baseline justify-between ${i === 0 ? "" : "border-t pt-5"}`}
                    style={{ borderColor: i === 0 ? "transparent" : "#F1EFE6" }}
                  >
                    <dt className="text-sm text-zinc-700">{s.label}</dt>
                    <dd
                      className={i === 0 ? "text-3xl font-semibold" : "text-base font-medium"}
                      style={{ color: i === 0 ? "#1F4D32" : "#1F2A20" }}
                    >
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Caddie's note: brass accent · #C89968
            </p>
          </div>
        </div>

        <div className="mt-16">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Featured courses
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {FEATURED.map((f) => (
              <div
                key={f}
                className="rounded-lg border bg-white px-4 py-3 text-sm text-zinc-900 transition-colors hover:border-emerald-700"
                style={{ borderColor: "#E4E2D8" }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Direction 3 — Modern Sports Bento                                       */
/* ────────────────────────────────────────────────────────────────────── */

function ModernBento() {
  return (
    <section
      id="bento"
      className="relative"
      style={{ backgroundColor: "#0A1812", color: "#E6F4EA" }}
    >
      {/* soft glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/4 h-[400px] w-[600px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #4ADE80 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-24">
        <Tag label="3 · Modern Sports Bento" tone="lime" />
        <div className="mt-10">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wider"
            style={{ borderColor: "rgba(74,222,128,0.3)", color: "#4ADE80" }}
          >
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: "#4ADE80" }}
            />
            CADDIEREEL
          </p>
          <h2 className="mt-6 text-7xl font-bold leading-[0.98] tracking-tight">
            Find golf videos
            <br />
            by{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #4ADE80, #86EFAC)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              course
            </span>
            .
          </h2>
          <p className="mt-6 max-w-xl text-lg text-zinc-300">
            Pulls course mentions out of titles, descriptions, and auto-captions
            across seven channels and 6,751 videos.
          </p>

          <div className="mt-10 flex max-w-2xl items-center gap-3 rounded-xl border bg-black/30 px-5 py-4 backdrop-blur"
            style={{ borderColor: "rgba(74,222,128,0.2)" }}>
            <span style={{ color: "#4ADE80" }}>⌕</span>
            <span className="flex-1 text-base text-zinc-500">
              Search by course — Pebble, Saticoy, Pinehurst…
            </span>
            <kbd
              className="rounded px-1.5 py-0.5 font-mono text-[10px]"
              style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80" }}
            >
              ⌘K
            </kbd>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`rounded-2xl border p-6 ${i === 0 ? "md:col-span-2 md:row-span-1" : ""}`}
                style={{
                  borderColor: "rgba(74,222,128,0.15)",
                  background: i === 0
                    ? "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(74,222,128,0.02))"
                    : "rgba(255,255,255,0.02)",
                }}
              >
                <p
                  className={i === 0 ? "text-6xl font-bold" : "text-3xl font-semibold"}
                  style={{ color: i === 0 ? "#86EFAC" : "#E6F4EA" }}
                >
                  {s.value}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wider text-zinc-400">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Popular courses
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {FEATURED.map((f) => (
                <span
                  key={f}
                  className="rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-emerald-400"
                  style={{ borderColor: "rgba(74,222,128,0.2)", color: "#E6F4EA" }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Direction 4 — Photography-First                                         */
/* ────────────────────────────────────────────────────────────────────── */

function PhotoFirst() {
  return (
    <section id="photo" className="relative overflow-hidden">
      {/* CSS-only golf-course-ish gradient background, since we don't have a real photo */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #0a3a1f 0%, #1a5e35 35%, #2d7a4a 60%, #4a9c5e 80%, #c2956a 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 20%, rgba(255,220,150,0.4) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-32">
        <Tag label="4 · Photography-First" tone="white" />
        <div className="mt-10">
          <p className="text-xs uppercase tracking-[0.3em] text-white/80">
            CaddieReel
          </p>
          <h2
            className="mt-6 text-7xl font-bold leading-[0.95] tracking-tight text-white md:text-8xl"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}
          >
            Find golf videos
            <br />
            by course.
          </h2>
          <p className="mt-6 max-w-xl text-lg text-white/90">
            Every fairway worth playing, every channel worth watching, indexed
            by where they actually played.
          </p>

          <div className="mt-12 rounded-2xl border border-white/30 bg-white/10 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3 rounded-lg border border-white/40 bg-white/95 px-5 py-3.5">
              <span className="text-zinc-400">⌕</span>
              <span className="flex-1 text-base text-zinc-500">
                Search by course — try Pebble, Saticoy, Pinehurst…
              </span>
              <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                ⌘K
              </kbd>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-3">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 backdrop-blur"
                >
                  <p className="text-2xl font-semibold text-white">{s.value}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/70">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* shared                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

function Tag({
  label,
  tone,
}: {
  label: string;
  tone: "forest" | "lime" | "white";
}) {
  const styles =
    tone === "forest"
      ? { color: "#F4F1EA", background: "#1F4D32" }
      : tone === "lime"
        ? { color: "#0A1812", background: "#4ADE80" }
        : { color: "#1F2A20", background: "rgba(255,255,255,0.95)" };
  return (
    <span
      className="inline-block rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-wider"
      style={styles}
    >
      {label}
    </span>
  );
}
