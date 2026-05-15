/**
 * Title-based pre-filter to skip videos that clearly aren't course play.
 *
 * Goal: avoid paying an LLM call to learn what we could already tell from
 * the title — "What's In My Bag", "Iron Test", "Swing Tip", etc.
 *
 * Tradeoff: a false-positive here means we never index a real course video.
 * To bound that risk, every skip pattern requires the title NOT also contain
 * a course-positive keyword ("course", "club", "links", "round at", etc.) —
 * so a title like "I Tested My Driver at Pebble Beach" still gets extracted.
 */

const SKIP_PATTERNS: RegExp[] = [
  /\bwhat'?s in my bag\b/i,
  /\bwitb\b/i,
  /\bunboxing\b/i,
  /\bclub (review|test|comparison)\b/i,
  /\b(driver|iron|wedge|putter|ball|shaft|grip) (review|test|comparison|tested)\b/i,
  /\b(swing|chipping|putting|bunker|wedge) (tip|tips|lesson|drill|drills)\b/i,
  /\bhow to (hit|swing|putt|chip|stop|fix|cure|grip)\b/i,
  /\b(q&a|q & a|q and a)\b/i,
  /\b(reacts? to|reaction to|reacting to)\b/i,
  /\bvlog\b/i,
  /\bpodcast\b/i,
  /\bday in the life\b/i,
  /\btop (3|5|10|20) (drivers?|irons?|wedges?|putters?|balls?)\b/i,
  /\bbest (driver|iron|wedge|putter|ball|golf bag)s? of (20\d\d|the year)\b/i,
  /\btier list\b/i,
  /\b(launch|first look)\b.*\b(driver|iron|wedge|putter)\b/i,
];

const COURSE_KEYWORDS: RegExp[] = [
  /\bcourse\b/i,
  /\bclub\b/i,
  /\blinks\b/i,
  /\bplayed (at|on)\b/i,
  /\bplaying (at|on)\b/i,
  /\bround (at|of|on)\b/i,
  /\bbreaking? \d+\b/i,
  /\bmatch (at|on)\b/i,
  /\bopen\b/i, // "playing the open at..."
];

export function shouldSkipForExtraction(title: string): boolean {
  if (!title) return false;
  const hasCourseKeyword = COURSE_KEYWORDS.some((re) => re.test(title));
  if (hasCourseKeyword) return false;
  return SKIP_PATTERNS.some((re) => re.test(title));
}
