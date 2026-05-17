/**
 * Shared visual primitives for the Yardage Book aesthetic.
 * Used by the home page and course pages so styling stays in lockstep.
 */

export function Divider() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="h-px w-full bg-[#1F4D32]/15" />
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] uppercase tracking-[0.32em] text-[#1F4D32]"
      style={{ fontFamily: "var(--font-geist-sans)" }}
    >
      {children}
    </p>
  );
}

/**
 * Topographic SVG background pattern. Place once per page at the top of
 * the main element. Sits fixed under content with low opacity.
 */
export function TopographicPattern() {
  return (
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
  );
}

/**
 * Top-nav header shown on every page. Logo links home, nav links jump to
 * the home-page anchors (Map / Channels / Courses).
 */
import Link from "next/link";

export function YardageHeader() {
  return (
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
          href="/#channels"
          className="text-[#1F2A20]/80 underline-offset-4 hover:text-[#1F4D32] hover:underline"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          Channels
        </Link>
        <Link
          href="/#featured"
          className="text-[#1F2A20]/80 underline-offset-4 hover:text-[#1F4D32] hover:underline"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          Courses
        </Link>
      </nav>
    </header>
  );
}
