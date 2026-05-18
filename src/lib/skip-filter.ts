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
  // Deliberately omits "clubs?" / "set" / "bag" / "equipment" from the trailing list:
  // those are ambiguous between equipment showcases and round-with-new-clubs course
  // play videos (e.g. "I played with the NEW McLaren Golf Clubs" — real course play).
  // The LLM's VIDEO PURPOSE TEST decides on those.
  /\b(taylormade|callaway|titleist|mizuno|ping|pxg|cobra|wilson|srixon|cleveland|bridgestone|honma|tour edge|cobra puma|vice|onCore|snell|sub\s*70|stix|maxfli|miura|epon)\b.*\b(driver|iron|irons|wedge|wedges|putter|putters|hybrid|fairway|wood|woods|ball|balls)\b/i,

  // Narrow equipment-test framing ("Testing the new TaylorMade Stealth driver").
  // Excludes "played/using" — those imply playing a round with the gear.
  /\b(testing|tested|reviewing|reviewed|comparing|compared) (with )?(the |my |a |an |brand |these )?(brand )?new (\w+\s+){0,3}(driver|drivers|iron|irons|wedge|wedges|putter|putters|hybrid|hybrids)\b/i,

  // "BEST/WORST DRIVERS in golf", "best putter ever" — ranking-style equipment
  /\b(best|worst|cheapest|most expensive|longest|shortest) (drivers?|irons?|wedges?|putters?|hybrids?|balls?|golf bags?|fairway woods?|woods?)\b/i,

  // "Picking the best fairway wood", "I choose my new driver", "Choosing a driver"
  /\b(pick(ing)?|chose|choose|choosing|select(ing)?|selected) (the |a |my |your |new )?(best |right |perfect |new )?(driver|iron|irons|wedge|wedges|putter|putters|hybrid|hybrids|ball|balls|fairway wood|fairway|woods?)\b/i,

  // Buying / fitting guides ("8 mistakes when buying a driver", "What to look for when choosing irons")
  /\b(mistakes|errors|things|tips|what to know|guide|guides) (when|while|to know|to avoid|for) (buying|choosing|picking|fitting|using|getting)/i,
  /\b(buying|fitting) (a|an|the|my|your|new)? (driver|iron|wedge|putter|hybrid|ball|fairway wood)\b/i,
  // "Ultimate buyer's guide" / "Buyer's guide" — equipment-purchase framing
  /\bbuyer'?s guide\b/i,
  /\bultimate (buyer'?s|buying|equipment) guide\b/i,
  // "Which/what irons should you use" / "Which driver is best for you"
  /\b(which|what) (driver|drivers|iron|irons|wedge|wedges|putter|putters|hybrid|hybrids|ball|balls|clubs?|fairway woods?|woods?|shaft|grip|set|set of clubs|equipment) (should|do|are|is|will|would|to)\b/i,

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

  // Putting / chipping / trick-shot challenges — not course play
  // ("LOOP THE LOOP PUTTING CHALLENGE", "TRICK SHOT CONTEST")
  /\b(putting|chipping|driving range|trick shot|trick shots|short game|long game|bunker|flop shot) (challenge|contest|competition|tournament|game|battle)\b/i,
  /\b(mini golf|mini-golf|putt putt|putt-putt|minigolf|mini-putt|mini putt)\b/i,
  /\bloop the loop\b/i,

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

  // Opinion / editorial / "is X the best form of Y" framing
  // ("Are links courses the best form of golf?")
  /\b(are|is) (links?|target|parkland|the )?[\w'-]* ?courses? the best\b/i,

  // "[N] things great golfers do" / "5 easy things..." — instructional listicle
  /\b\d+\s+(easy|simple|amazing|surprising|brilliant|effective|smart|powerful|key|essential|crucial|hard) (things|tips|tricks|habits|secrets|moves|drills|shots|reasons) (every|great|good|amateur|pro|professional|tour|low|high|all|the best|elite|top|smart)\s+(golfers?|players?)\b/i,
  /\b\d+\s+(things|tips|tricks|habits|secrets|drills) (every|great|good|amateur|pro|professional|tour|low|high|all|elite|top)\s+(golfers?|players?) (do|need|should|must)\b/i,

  // "Why doesn't/don't X use Y" — opinion / equipment piece
  /\bwhy (doesn'?t|don'?t|won'?t|wouldn'?t|shouldn'?t|isn'?t|aren'?t)\b/i,

  // Handicap-recap videos that list courses played without filming there
  // ("Rick Shiels OFFICIAL golf handicap - very SURPRISED!")
  /\b(official|my actual|true|real|current|what'?s my|revealing my)\s+(golf\s+)?handicap\b/i,

  // Equipment thrift / shopping ("I buy RARE golf clubs in St Andrews (thrift)")
  /\b(thrift|thrifting|second\s*-?hand)\b/i,
  /\bi\s+(buy|bought|found)\s+(the\s+)?(rare|cheap|vintage|old|antique|used|secondhand|second-hand)\s+(golf\s+)?clubs?\b/i,

  // Peter Finch's COVID-era simulator-based creator tournament series
  /\bisolation invitational\b/i,

  // Biographical / podcast-series episode framing — BDS "Perez Vs" series
  // and similar. "The Story of [person]" is sit-down storytelling, not a round.
  /\bthe story of\b/i,
  /\bvs\.?\s+episode\s+\d+\b/i,

  // Tournament broadcast / commentary formats — most often No Laying Up
  // covering the AT&T Pebble Beach Pro-Am, U.S. Open, etc. They're on-site
  // at the host course but commenting on pro play, not playing themselves.
  /\blive (at|from) (the )?\b/i,
  /\b(killhouse|kill\s*house)\b/i,
  /\brange show\b/i,
  /\ba bunch of questions\b/i,
  /\bfilm room\b/i,
  /\b(happy hour|office hours)\b/i,
  /\bweeks?\s+in\s+the\s+life\b/i,
  /\b(pro[\s-]?am|tournament|championship) (recap|preview|coverage|breakdown)\b/i,

  // Gimmick / stunt golf — the bit is the protagonist, not the course.
  // Mostly Good Good / GM GOLF formats but generalizable.
  /\bwheel of not ideal\b/i,
  // Modified / damaged clubs ("we cut clubs in half", "drilled holes in clubs",
  // "sandpaper on clubs", "vaseline on clubs", "rubber bands on clubs")
  /\b(cut|drilled|wrap(?:ped)?|sand\s*paper(?:ed)?|vaseline|melted|painted)\b[\w\s]{0,20}\b(clubs?|club\s*face|grooves?)\b/i,
  // "Playing with N clubs" / "Playing With 20 Inch Clubs"
  /\bplaying (golf )?with (only )?\d+\s+(inch\s+)?clubs?\b/i,
  // "Wedges only" / "1 iron only" / "3 wood only" / "60 degree only" / "Driver only" / "Putter only"
  /\b(wedge|wedges|1\s*iron|1\s*irons|3\s*wood|3\s*woods|driver|drivers|60\s*degree|putter|putters)\s+only\b/i,
  // "1 club challenge" / "3 Club Challenge" / "14 Club Challenge" / "42 Club Challenge"
  /\b\d+\s+clubs?\s+(challenge|only)\b/i,
  // Discount-store club challenges
  /\b(walmart|dick'?s sporting goods|goodwill|target|costco|amazon|second\s*hand)\b[\w\s]{0,30}\b(golf|clubs?|challenge|budget)\b/i,
  // "$X budget" club challenges
  /\$\d+\s+(budget|clubs?|challenge)\b/i,
  // Glow / night golf gimmicks
  /\b(glow|night)\s+golf\b/i,
  // Physical gimmicks
  /\bblindfolded\b/i,
  /\b(on|using|with)\s+(only\s+)?(one|1)\s+(arm|leg|hand|foot)\b/i,
  /\bupside\s+down\b/i,
  /\bleft\s*-?\s*handed\s+(clubs?|golf)\b/i,
  // Ball-modification gimmicks (burnt/floating/range/toy balls)
  /\b(burnt|burned|floating|toy)\s+(golf\s+)?balls?\b/i,
  /\bwith\s+(a|an)\s+range\s+ball\b/i,
  // Golf HORSE / TopGolf HORSE games
  /\bgolf\s+horse\b/i,
  /\bhorse\s+challenge\b/i,
  // Adjustable / weird-equipment gimmicks
  /\badjustable\s+club\b/i,
  // Shot-style-every-tee gimmicks
  /\b(stinger|low\s+shot|tee(d|ing)?\s+(it\s+)?up\s+high)\s+(off|on)\s+every\b/i,
  // Cheapest-possible-golf framing
  /\bas\s+cheap\s+as\s+possible\b/i,
  /\bcheap(est)?\s+(golf\s+)?clubs?\b/i,
  // Random / bizarre matchup formats explicitly framed as challenges
  /\brandom\s+golf\s+shot\s+challenge\b/i,
  /\bcomplete\s+silence\s+(golf\s+)?challenge\b/i,

  // Comedy-swing / weird-grip gimmicks
  /\bhappy\s+gilmore\b/i,
  /\bcross\s*-?\s*hand(ed)?\b/i,
  // Broken / damaged single clubs
  /\bbroken\s+(driver|3\s*wood|wood|iron|wedge|putter|club)\b/i,
  /\bwith\s+(a|an)\s+broken\b/i,
  // "N degree driver" — radical-loft modified clubs (e.g. "3 Degree DRIVER")
  /\b\d+\s*(degree|deg)\s+(driver|wedge|iron|3\s*wood|fairway)\b/i,
  // Modified balls (duct tape, wrapped, sand-paper balls)
  /\b(duct\s*tape|sand\s*paper|painted)\s+(golf\s+)?balls?\b/i,
  /\bdoctored\s+(clubs?|balls?)\b/i,
  // Ball/club doping framing
  /\bspin\s+doctor\b/i,
  /\billegal\s+substance\b/i,
  /\b(makes?|making)\s+the\s+ball\s+(fly\s+)?(straight|spin|stop)\b/i,
  // Pan / frying pan / weird object as a club
  /\bwith\s+(a|an)\s+(pan|frying\s+pan|hockey\s+stick|broom|baseball\s+bat|tennis\s+racket|shovel)\b/i,
  // Holiday-themed challenges
  /\bchristmas\s+golf\s+(challenge|match)\b/i,
  /\bholiday\s+(golf\s+)?challenge\b/i,
  // "$N vs $N" match (money gimmick — implies challenge format with extreme price spread)
  /\$\d+\s+vs\.?\s+\$\d+\b/i,
  // "Swap clubs" / "club swap" gimmicks
  /\b(swap(ped|ping)?|swap)\s+(golf\s+)?clubs?\b/i,
  /\b(my\s+)?(girlfriend|boyfriend|wife|husband|dog|kid|baby|cat)\s+(picks?|chose|chooses?)\s+(my|our|the)\s+(golf\s+)?clubs?\b/i,
  // Equipment-showcase framing (forgiving / longest / etc. clubs)
  /\bmost\s+forgiving\s+(golf\s+)?clubs?\b/i,
  /\blongest\s+(golf\s+)?clubs?\b/i,
  // "w/ N clubs" or "with N clubs only" framing
  /\bw\/\s*\d+\s+clubs?\b/i,
  // "Restarted golf career on $N budget" / similar pursuit-gimmick framing
  /\brestarted\s+(my|our)\s+golf\s+career/i,
  // "Bought my first club" / equipment-acquisition videos
  /\b(bought|got)\s+my\s+first\s+(golf\s+)?(clubs?|driver|wedge|putter|iron)\b/i,
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
