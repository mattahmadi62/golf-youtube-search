/**
 * Auto-resolve pending extraction_review_queue rows by fuzzy-matching the
 * LLM-extracted candidate name against the courses table via pg_trgm. The
 * existing matcher (src/lib/match.ts) is intentionally conservative: it only
 * does exact-name, alias, and substring(curated). That leaves naming variants
 * unmatched — "Sandpiper Golf Club" vs "Sandpiper Golf Course",
 * "Old Course at St Andrews" vs "St Andrews Old Course", etc.
 *
 * For each pending row we:
 *   1. similarity() against courses.name AND every alias, take the top row
 *   2. Require sim >= MIN_SIM and a clear gap >= MIN_GAP to runner-up
 *   3. Insert video_courses, mark queue row 'linked'
 *   4. Append the candidate name to the matched course's aliases so the next
 *      extraction matches exactly via the live path
 *
 * Dry-run by default. Pass --apply to write.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const APPLY = process.argv.includes("--apply");
const MIN_SIM = 0.7;
const MIN_GAP = 0.1;
const MIN_CANDIDATE_LEN = 6;

// Tokens too generic to anchor a match. Used for the token-overlap guard.
const STOPWORDS = new Set([
  "golf", "club", "course", "country", "links", "the", "and", "at",
  "of", "&", "resort", "national", "championship",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Reject if the candidate has a distinctive (length>=4) token that is NOT
// present in the matched name. Catches "Formby Hall Golf Club" → "Formby
// Golf Club", "Bobby Jones" → "Jones", "Rancho Santa Fe" → "Santa Fe". We
// allow short extras (e.g. "old") and stem-related extras ("canyon" matches
// "canyons" via substring) so we don't lose legit variant matches.
function candidateHasOrphanQualifier(candTokens: Set<string>, matchTokens: Set<string>): boolean {
  for (const t of candTokens) {
    if (t.length < 4) continue;
    if (matchTokens.has(t)) continue;
    let stemRelated = false;
    for (const m of matchTokens) {
      if (m.includes(t) || t.includes(m)) {
        stemRelated = true;
        break;
      }
    }
    if (!stemRelated) return true;
  }
  return false;
}

// Tiny retry wrapper: Neon HTTP occasionally returns ECONNRESET on long
// passes. Retry up to 4 times with exponential backoff.
async function withRetry<T>(fn: () => Promise<T>, label = ""): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error)?.message ?? err);
      if (!/ECONNRESET|fetch failed|ETIMEDOUT|socket hang up/i.test(msg)) throw err;
      const wait = 500 * Math.pow(2, attempt);
      process.stderr.write(`  retry ${label} in ${wait}ms (${msg.slice(0, 60)})\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function main() {
  const sql = neon(DATABASE_URL!);

  const pending = (await sql`
    SELECT id, video_id, candidate_name, evidence
    FROM extraction_review_queue
    WHERE status = 'pending'
  `) as Array<{ id: string; video_id: string; candidate_name: string; evidence: string | null }>;

  console.log(`Pending review rows: ${pending.length}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "dry-run"} | min_sim=${MIN_SIM} min_gap=${MIN_GAP}`);

  let resolved = 0;
  let skippedShort = 0;
  let skippedLowSim = 0;
  let skippedNarrowGap = 0;
  let skippedLowJaccard = 0;
  const sampleResolved: Array<{ cand: string; matched: string; sim: number }> = [];
  const sampleRejected: Array<{ cand: string; reason: string; top?: string; sim?: number }> = [];

  // Cache: courseId -> updated aliases array to push at end (avoid N updates)
  const pendingAliasAdds = new Map<string, Set<string>>();

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    const cand = row.candidate_name.trim();

    if (cand.length < MIN_CANDIDATE_LEN) {
      skippedShort++;
      continue;
    }

    // pg_trgm search against name and aliases. We take top 2 to check gap.
    const top = (await withRetry(() => sql`
      WITH scored AS (
        SELECT id, name, similarity(name, ${cand}) AS sim
        FROM courses
        WHERE similarity(name, ${cand}) > 0.3

        UNION ALL

        SELECT c.id, c.name, similarity(a, ${cand}) AS sim
        FROM courses c, unnest(c.aliases) AS a
        WHERE similarity(a, ${cand}) > 0.3
      ),
      best AS (
        SELECT id, name, MAX(sim) AS sim
        FROM scored
        GROUP BY id, name
      )
      SELECT id, name, sim
      FROM best
      ORDER BY sim DESC
      LIMIT 2
    `, "trgm")) as Array<{ id: string; name: string; sim: number }>;

    if (top.length === 0 || top[0].sim < MIN_SIM) {
      skippedLowSim++;
      if (sampleRejected.length < 25) {
        sampleRejected.push({
          cand,
          reason: "no_match",
          top: top[0]?.name,
          sim: top[0]?.sim,
        });
      }
      continue;
    }

    const gap = top.length > 1 ? top[0].sim - top[1].sim : 1;
    if (gap < MIN_GAP) {
      skippedNarrowGap++;
      if (sampleRejected.length < 25) {
        sampleRejected.push({
          cand,
          reason: `narrow_gap(${top[0].name} ${top[0].sim.toFixed(2)} vs ${top[1].name} ${top[1].sim.toFixed(2)})`,
        });
      }
      continue;
    }

    // Token-Jaccard guard against trigram false positives like "Sun Valley" / "Payne's Valley"
    const candT = tokens(cand);
    const matchT = tokens(top[0].name);
    const j = jaccard(candT, matchT);
    if (j < 0.5) {
      skippedLowJaccard++;
      if (sampleRejected.length < 25) {
        sampleRejected.push({
          cand,
          reason: `low_jaccard(${j.toFixed(2)})`,
          top: top[0].name,
          sim: top[0].sim,
        });
      }
      continue;
    }

    // Asymmetric guard: if the candidate has a distinctive token the match
    // doesn't, it's likely a more-specific course (Formby Hall != Formby).
    if (candidateHasOrphanQualifier(candT, matchT)) {
      skippedLowJaccard++;
      if (sampleRejected.length < 25) {
        sampleRejected.push({
          cand,
          reason: `orphan_qualifier`,
          top: top[0].name,
          sim: top[0].sim,
        });
      }
      continue;
    }

    // We have a winner.
    if (APPLY) {
      await withRetry(() => sql`
        INSERT INTO video_courses (video_id, course_id, confidence, source, evidence)
        VALUES (${row.video_id}, ${top[0].id}, ${(0.85 * top[0].sim).toFixed(2)}, 'fuzzy_review', ${row.evidence})
        ON CONFLICT (video_id, course_id) DO NOTHING
      `, "insert");
      await withRetry(() => sql`
        UPDATE extraction_review_queue
        SET status = 'linked', resolved_course_id = ${top[0].id}
        WHERE id = ${row.id} AND status = 'pending'
      `, "update");
      // queue an alias add (deduped per course)
      const set = pendingAliasAdds.get(top[0].id) ?? new Set<string>();
      set.add(cand);
      pendingAliasAdds.set(top[0].id, set);
    }

    resolved++;
    if (sampleResolved.length < 25) {
      sampleResolved.push({ cand, matched: top[0].name, sim: top[0].sim });
    }

    if ((i + 1) % 50 === 0) {
      process.stdout.write(
        `\r  scanned ${i + 1}/${pending.length}  resolved=${resolved}   `,
      );
    }
  }
  process.stdout.write("\n");

  // Flush alias additions (one update per course)
  if (APPLY && pendingAliasAdds.size > 0) {
    console.log(`\nAppending aliases to ${pendingAliasAdds.size} courses...`);
    for (const [courseId, names] of pendingAliasAdds) {
      const arr = Array.from(names);
      await withRetry(() => sql`
        UPDATE courses
        SET aliases = ARRAY(
          SELECT DISTINCT a FROM unnest(COALESCE(aliases, ARRAY[]::text[]) || ${arr}::text[]) AS a
        )
        WHERE id = ${courseId}
      `, "alias");
    }
  }

  console.log(`\nResults:`);
  console.log(`  Resolved:           ${resolved}`);
  console.log(`  Skipped (too short):${skippedShort}`);
  console.log(`  Skipped (low sim):  ${skippedLowSim}`);
  console.log(`  Skipped (narrow gap):${skippedNarrowGap}`);
  console.log(`  Skipped (low jaccard):${skippedLowJaccard}`);

  console.log(`\nSample resolved:`);
  for (const s of sampleResolved) console.log(`  ✓ "${s.cand}" → "${s.matched}" (sim=${s.sim.toFixed(2)})`);

  console.log(`\nSample rejected:`);
  for (const r of sampleRejected) {
    console.log(`  ✗ "${r.cand}" — ${r.reason}${r.top ? ` (top="${r.top}" sim=${r.sim?.toFixed(2)})` : ""}`);
  }

  if (!APPLY) console.log(`\n(dry run — pass --apply to write)`);
}

main().catch((err) => {
  console.error("Resolve failed:", err);
  process.exit(1);
});
