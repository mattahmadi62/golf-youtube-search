/**
 * Pre-filter to skip videos that clearly aren't course play.
 *
 * Three signal layers:
 *   1. Duration — Shorts (≤90s) are almost never a round of golf.
 *   2. Title patterns that mean "not course play" — podcasts, equipment
 *      reviews, swing tips, vlogs, Q&A, hashtag-Short markers.
 *   3. An override list of "course-positive" keywords ("course", "club",
 *      "played at", "round at"…) that makes a borderline title kept,
 *      so "I Tested My Driver at Pebble Beach" still gets extracted.
 *
 * Used by both extract-courses.ts (before paying an LLM call) and
 * cleanup-extractions.ts (to retroactively remove bad video_courses
 * rows that got created before the filter was wired in).
 */

const SHORTS_MAX_DURATION_S = 90;

const SKIP_PATTERNS: RegExp[] = [
  // Hashtag-style Shorts markers
  /#shorts?\b/i,

  // Equipment / WITB content
  /\bwhat'?s in my bag\b/i,
  /\bwitb\b/i,
  /\bunboxing\b/i,
  /\bclub (review|test|comparison|fitting)\b/i,
  /\b(driver|iron|wedge|putter|ball|shaft|grip|hybrid|fairway wood) (review|test|comparison|tested|fitting)\b/i,
  /\b(testing|reviewing) (the |new |my )?(driver|iron|wedge|putter|hybrid)/i,

  // Instruction
  /\b(swing|chipping|putting|bunker|wedge|driving|short game|long game) (tip|tips|lesson|lessons|drill|drills|fix|fixes)\b/i,
  /\bhow to (hit|swing|putt|chip|stop|fix|cure|grip|shape|draw|fade|control|aim)\b/i,
  /\b(stop|fix|cure) (slicing|hooking|topping|chunking|fat shots|thin shots)\b/i,
  /\bgolf (lesson|tip|drill|drills)\b/i,
  /\b(mistakes|errors) (all )?(amateur|average) golfers? make\b/i,

  // Discussion / reaction / talk-shows
  /\b(q\s*&\s*a|q and a)\b/i,
  /\b(reacts?|reaction|reacting) to\b/i,
  /\b(reacts?|reaction) to\b/i,
  /\bgolfers? react\b/i,
  /\bpodcast\b/i,
  /\b(rough cut|fore play|no laying up|club pro guy|shotgun start|subpar|on the mark|tour confidential|chuck and lefty|the chunk)\b/i, // golf-podcast brands
  /\bvlog\b/i,
  /\bday in the life\b/i,
  /\binterview\b/i,

  // Lists and rankings
  /\btop (3|5|10|20|25) (drivers?|irons?|wedges?|putters?|balls?|courses?|moments|shots?|fails?)\b/i,
  /\bbest (driver|iron|wedge|putter|ball|golf bag)s? of (20\d\d|the year|all time)\b/i,
  /\btier list\b/i,
  /\b(launch|first look|first impressions?)\b.*\b(driver|iron|wedge|putter)\b/i,

  // Previews / discussion of tournaments without playing
  /\bpreview\b.*\b(masters|open|us open|pga championship|ryder cup|liv|fedex)/i,
  /\b(masters|open|us open|pga championship|ryder cup) preview\b/i,
  /\bpreview the\b/i,

  // Memes / question formats / quiz / would-you-rather (almost always Shorts)
  /\bwould you rather\b/i,
  /\b(quiz|trivia)\b/i,

  // Tour walkthroughs (talking about, not playing)
  /\btour of (the |this )?(golf course|country club|club|course)\b/i,
];

const COURSE_KEYWORDS: RegExp[] = [
  /\bcourse\b/i,
  /\bclub\b/i,
  /\blinks\b/i,
  /\bplayed (at|on)\b/i,
  /\bplaying (at|on)\b/i,
  /\bround (at|of|on)\b/i,
  /\b(break|breaking) (60|70|80|90|100)\b/i,
  /\bmatch (at|on)\b/i,
  /\b(9|18) holes? at\b/i,
];

export type VideoForFilter = {
  title: string;
  durationS: number | null | undefined;
};

export type SkipReason =
  | { skip: false }
  | { skip: true; reason: "short" }
  | { skip: true; reason: "title-pattern"; pattern: string };

export function evaluateSkip(v: VideoForFilter): SkipReason {
  const title = v.title ?? "";

  // Duration check first — Shorts are the cleanest signal.
  if (typeof v.durationS === "number" && v.durationS > 0 && v.durationS <= SHORTS_MAX_DURATION_S) {
    return { skip: true, reason: "short" };
  }

  // Title-positive override: don't skip if a strong course-keyword is present.
  const hasCourseKeyword = COURSE_KEYWORDS.some((re) => re.test(title));
  if (hasCourseKeyword) return { skip: false };

  for (const re of SKIP_PATTERNS) {
    if (re.test(title)) {
      return { skip: true, reason: "title-pattern", pattern: re.source };
    }
  }
  return { skip: false };
}

// Backwards-compatible convenience for the existing test script.
export function shouldSkipForExtraction(title: string): boolean {
  return evaluateSkip({ title, durationS: null }).skip;
}
