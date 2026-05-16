/**
 * Pre-filter to skip videos that clearly aren't course play.
 *
 * Three signal layers, in order:
 *   1. Duration — any video shorter than the floor is dropped. After
 *      auditing every match in the index, no real round-of-golf content
 *      runs under ~10 minutes; sub-10-minute matches were nearly all
 *      announcements, BTS, promos, sim demos, or LLM false positives.
 *   2. Hard skip patterns — instructional content (swing fixes, slice
 *      fixes, lessons, drills), equipment reviews (with or without brand
 *      name), podcasts, vlogs, reactions. These ALWAYS skip, even at a
 *      famous course. "Tips & Tricks to Pebble Beach" is still a tips
 *      video, not course content.
 *   3. Ambiguous patterns + override — a small set of weaker signals
 *      (just "review", just "preview", just "tour of") only skip when
 *      the title doesn't ALSO mention a strong course keyword. This
 *      preserves rare edge cases like "Course Tour" videos that ARE
 *      course content.
 */

// Tightened from 90s to 600s based on auditing matched videos: every
// confirmed real course-play video in our catalog is ≥10 min, and the few
// sub-10-min matches were promos, sim demos, or false positives.
const MIN_DURATION_S = 600;

// ============================================================================
// HARD SKIP PATTERNS — always skip, no override.
// ============================================================================

const HARD_SKIP_PATTERNS: RegExp[] = [
  // Shorts markers
  /#shorts?\b/i,

  // Equipment / WITB content
  /\bwhat'?s in my bag\b/i,
  /\bwitb\b/i,
  /\bunboxing\b/i,

  // Equipment review/test — equipment word followed by action
  /\b(driver|iron|irons|wedge|wedges|putter|putters|ball|balls|shaft|grip|hybrid|fairway wood|woods?) (review|test|comparison|tested|fitting|launch|launched|released|battle)\b/i,

  // Action followed by equipment ("Tested the New Driver", "Reviewing My Irons")
  /\b(testing|reviewing|comparing|fitting) (the |a |new |my |these )?(driver|iron|irons|wedge|wedges|putter|putters|hybrid|hybrids)\b/i,

  // Brand-led equipment titles ("TaylorMade Stealth Driver Review", "PING G430 Iron")
  /\b(taylormade|callaway|titleist|mizuno|ping|pxg|cobra|wilson|srixon|cleveland|bridgestone|honma|tour edge|cobra puma|vice|onCore|snell)\b.*\b(driver|iron|irons|wedge|wedges|putter|putters|hybrid|fairway|wood|woods|ball|balls)\b/i,

  // "BEST/WORST DRIVERS in golf", "best putter ever" — ranking-style equipment
  /\b(best|worst|cheapest|most expensive|longest|shortest) (drivers?|irons?|wedges?|putters?|hybrids?|balls?|golf bags?|fairway woods?|woods?)\b/i,

  // "Picking the best fairway wood", "I choose my new driver", "Choosing a driver"
  /\b(pick(ing)?|chose|choose|choosing|select(ing)?|selected) (the |a |my |your |new )?(best |right |perfect |new )?(driver|iron|irons|wedge|wedges|putter|putters|hybrid|hybrids|ball|balls|fairway wood|fairway|woods?)\b/i,

  // Buying / fitting guides ("8 mistakes when buying a driver", "What to look for when choosing irons")
  /\b(mistakes|errors|things|tips|what to know|guide|guides) (when|while|to know|to avoid|for) (buying|choosing|picking|fitting|using|getting)/i,
  /\b(buying|fitting) (a|an|the|my|your|new)? (driver|iron|wedge|putter|hybrid|ball|fairway wood)\b/i,

  // "This X is about to transform my game" / "How I improved my swing" / "Level up your game"
  /\b(transform|change|fix|cure|level up|improve|levelup) (my|your|the) (game|swing|drive|short game|putting|chipping|driving|round)\b/i,
  /\bhow i (improved|improve|lowered|dropped|cut|added|gained|increased|fixed|stopped|cured)\b/i,
  /\bimprove your (game|swing|drive|short game|putting|chipping|score|handicap|round)\b/i,
  /\b(level up|elevate) your (game|swing|drive|short game|putting)\b/i,

  // Distance / launch monitor tests (almost always equipment, not course play)
  /\b(distance test|carry test|launch monitor)\b/i,

  // Instruction / tips / drills
  /\b(swing|chipping|putting|bunker|wedge|driving|short game|long game|iron|ball) (tip|tips|lesson|lessons|drill|drills|fix|fixes|fundamental|fundamentals|technique|trick|tricks|analysis|analyzed|breakdown)\b/i,
  /\btips? (and|&) tricks?\b/i,
  /\b(golf|swing|putting|chipping|driving|iron) (lesson|lessons|drill|drills)\b/i,
  /\bgolf (tip|tips|drill|drills)\b/i,

  // Bare "lesson" framing — "Lesson W/", "Lesson with [coach]", "PGA Tour lesson",
  // "I gave him a lesson", "took a lesson", etc.
  /\blesson w[/\\]|\blesson (with|from|by)\b/i,
  /^\s*lesson\b/i,
  /\b(pga tour|tour pro|world renown coach) lesson\b/i,
  /\b(gave|gives|giving|got|getting|take|took|taking|teach|teaches|teaching) (him|her|them|me|you|us|.{1,30}) (a |my |the |their |our |some )?lessons?\b/i,
  /\b(inside look|what (a|an) .{1,20}lesson|first lesson|golf lesson)\b/i,

  // Swing / grip / setup analysis ("DAVIS LOVE iii SWING ANALYSIS")
  /\b(swing|grip|setup|alignment|stance|posture|tempo|impact|takeaway|backswing|downswing|release) (analysis|analyzed|breakdown|review)\b/i,

  // Swing fixes — "fix your slice", "cure that hook", "stop slicing"
  /\b(stop|fix|cure|kill|eliminate|prevent|conquer)( your| the| my| that)? (slic(e|ing|ed)|hook(s|ing|ed)?|top(ping|s|ped)?|chunk(ing|s|ed)?|fat shots?|thin shots?|shank(s|ing|ed)?|skull(s|ing|ed)?)\b/i,

  // "How to" — almost always instructional
  /\bhow to (hit|swing|putt|chip|stop|fix|cure|grip|shape|draw|fade|control|aim|play|score|read|setup|address|pitch|flop|escape|practice)\b/i,

  // "How I" instructional framing
  /\bhow i (hit|swing|fixed|fix|stopped|stop|cured|cure|increased|increase|added|add)\b/i,

  // "Lower your" — handicap/scores
  /\blower your (handicap|scores?|index)\b/i,
  /\b(lower|drop) (the )?(handicap|score|scores)\b/i,

  // Improvement framing
  /\b(improve|fix|transform) your (swing|drive|short game|putting|chipping|wedge play|iron play|ball striking|game)\b/i,
  /\bpure your irons\b/i,
  /\b(better|consistent|powerful|effortless|pure) (ball striking|driving|swing|contact)\b/i,
  /\b(ball striking|ball-striking) (tips?|secrets?|guide|guides)\b/i,

  // Mistakes / mental game
  /\b(mistakes|errors) (all )?(amateur|average|every|most) golfers? make\b/i,
  /\bmental (game|approach|tip|tips)\b/i,

  // Reactions / podcasts / pure discussion
  /\b(q\s*&\s*a|q and a)\b/i,
  /\b(reacts?|reaction|reacting) to\b/i,
  /\bgolfers? react\b/i,
  /\bpodcast\b/i,
  /\b(rough cut|fore play|no laying up|club pro guy|shotgun start|subpar|on the mark|tour confidential|chuck and lefty|the chunk|gimme putts|breakfast balls|the smylie show|cleek it|drop zone)\b/i,
  /\bday in the life\b/i,
  /\binterview(?:ing)?\b/i,

  // Press conferences, golf shows, talk shows, live broadcasts
  /\b(press conference|presser)\b/i,
  /\b(golf show|talk show|news show|monday night golf show)\b/i,
  /\blive (broadcast|stream|coverage)\b/i,

  // Interview / "talks golf" / "in conversation with" — podcast-style framing
  // ("Rick Shiels & Tommy Fleetwood talk golf")
  /\b(talks?|talking) (golf|to|about|with)\b/i,
  /\b(in conversation with|sit down with|sits down with|chats? with|chatting with)\b/i,
  // Q&A-style podcast formats
  // ("Part 2 JUSTIN ROSE SWING, ST GEORGE, AWKWARD QUESTIONS, TATTOOS & SPITTING")
  /\b(awkward|rapid fire|tough|hard|burning|fan|viewer|spicy|hot seat|fire) questions?\b/i,
  /\b(awkward|rapid fire|tough|hard|burning|fan|viewer|spicy) answers?\b/i,
  /\bhot seat\b/i,

  // Generic year-in-review / introspective format
  /\b(years? on youtube|years? of youtube|i'?ve done youtube)\b/i,
  /\b(here'?s what i'?ve learned|what i learned|lessons learned)\b/i,

  // Lists / rankings / tier lists ("TOP 10: Golf Courses You Must Play")
  /\btop\s*(3|4|5|6|7|10|15|20|25|50|100)\b[\s:\-—,]/i,
  /\bbest (driver|iron|wedge|putter|ball|golf bag|golf course)s? of (20\d\d|the year|all time|2\d{3})\b/i,
  /\btier list\b/i,
  /\bworst (golf|drivers?|irons?|wedges?|putters?|balls?|shots?)/i,
  /\b(courses|holes|shots) you (must|absolutely|have to|need to) play\b/i,
  /\b(most|absolutely) must play\b/i,

  // First look / first impression of equipment
  /\b(launch|first look|first impressions?|hands on)\b.*\b(driver|iron|wedge|putter|hybrid)\b/i,

  // Tournament discussion (not playing)
  /\b(masters|open|us open|pga championship|ryder cup|fedex|liv|presidents cup) (preview|recap|reaction|breakdown|analysis|discussion)\b/i,
  /\bpreview (of |for )?(the )?(masters|open|us open|pga championship|ryder cup|fedex|liv)/i,

  // Question / quiz / meme formats — almost always Shorts but catch the rest
  /\bwould you rather\b/i,
  /\b(quiz|trivia)\b/i,

  // BTS / announcements / promos / sim demos
  /\bbehind the scenes\b/i,
  /\bbts\b/i,
  /\bhuge announcement\b/i,
  /\bsimulator\b/i,
  /\btrugolf\b/i,
  /\b(trackman|skytrak|foresight|gcquad)\b/i,
];

// ============================================================================
// AMBIGUOUS PATTERNS — these only skip if the title doesn't ALSO contain
// a strong course-positive keyword.
// ============================================================================

const AMBIGUOUS_SKIP_PATTERNS: RegExp[] = [
  // Bare "review" or "tested" — could be equipment OR a course review
  /\breview\b/i,
  // "Course tour" by itself is sometimes a real flythrough video
  /\btour of (the |this )?(golf course|country club|club|course)\b/i,
  // "Vlog" — many course-play videos are titled "Course Vlog"; only skip
  // when no course keyword (e.g., "Day in the Life Vlog", "Tour Pro Vlog")
  /\bvlog\b/i,
];

const COURSE_KEYWORDS: RegExp[] = [
  /\bcourse\b/i,
  /\bclub\b/i,
  /\blinks\b/i,
  /\bplayed (at|on|the)\b/i,
  /\bplaying (at|on|the)\b/i,
  /\bround (at|of|on|with)\b/i,
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
  | { skip: true; reason: "short" | "title-pattern" };

export function evaluateSkip(v: VideoForFilter): SkipReason {
  const title = v.title ?? "";

  // Duration check — short videos and sub-floor videos always skip.
  if (typeof v.durationS === "number" && v.durationS > 0 && v.durationS < MIN_DURATION_S) {
    return { skip: true, reason: "short" };
  }

  // Hard skip — these win even when a course is mentioned.
  for (const re of HARD_SKIP_PATTERNS) {
    if (re.test(title)) return { skip: true, reason: "title-pattern" };
  }

  // Ambiguous patterns — only skip if no strong course signal.
  const hasCourseKeyword = COURSE_KEYWORDS.some((re) => re.test(title));
  if (!hasCourseKeyword) {
    for (const re of AMBIGUOUS_SKIP_PATTERNS) {
      if (re.test(title)) return { skip: true, reason: "title-pattern" };
    }
  }

  return { skip: false };
}

// Backwards-compat for tests / scripts that only had a title to check.
export function shouldSkipForExtraction(title: string): boolean {
  return evaluateSkip({ title, durationS: null }).skip;
}
