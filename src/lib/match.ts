import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

/**
 * Match an extracted course name against the courses table.
 *
 * Strategy:
 *   1. Exact case-insensitive match against `name` → confidence 1.0
 *   2. Case-insensitive match against any element of `aliases` → 0.95
 *   3. Bidirectional substring match against CURATED courses
 *      (extracted ⊂ canonical OR canonical ⊂ extracted) → 0.85
 *   4. One-directional substring match against OSM (non-curated) courses
 *      (extracted ⊂ canonical only) → 0.78
 *      Stricter: candidate length ≥ 8, course name longer than candidate,
 *      and only candidate-is-substring direction (the other direction is
 *      too dangerous on 13K OSM rows — short generic course names would
 *      over-match).
 *   5. No match — caller routes to the review queue.
 *
 * Pure fuzzy matching across all 13K rows produced too many false positives
 * during M2 (e.g., "Sun Valley" ↔ "Payne's Valley"). Substring on OSM is a
 * middle ground: catches cases like "Dove Canyon" → "Dove Canyon Country
 * Club" without auto-curation, without the trigram-noise risk.
 */
export type MatchResult =
  | {
      courseId: string;
      courseName: string;
      matchType: "exact_name" | "alias" | "substring" | "substring_osm";
      confidence: number;
    }
  | null;

export async function matchCourse(
  db: ReturnType<typeof drizzle>,
  extractedName: string,
): Promise<MatchResult> {
  const trimmed = extractedName.trim();
  if (!trimmed) return null;

  const result = (await db.execute(sql`
    WITH candidates AS (
      SELECT id, name, 'exact_name' AS match_type, 1.00::numeric AS confidence, 0 AS rank
      FROM courses
      WHERE LOWER(name) = LOWER(${trimmed})

      UNION ALL

      SELECT id, name, 'alias' AS match_type, 0.95::numeric AS confidence, 1 AS rank
      FROM courses
      WHERE EXISTS (
        SELECT 1 FROM unnest(aliases) AS a WHERE LOWER(a) = LOWER(${trimmed})
      )

      UNION ALL

      -- Curated substring: bidirectional (both candidate ⊂ name AND name ⊂ candidate)
      SELECT id, name, 'substring' AS match_type, 0.85::numeric AS confidence, 2 AS rank
      FROM courses
      WHERE is_curated = true
        AND (
          LOWER(name) LIKE LOWER('%' || ${trimmed} || '%')
          OR LOWER(${trimmed}) LIKE LOWER('%' || name || '%')
        )
        AND length(${trimmed}) >= 5

      UNION ALL

      -- OSM substring: one direction only (candidate ⊂ course name), stricter
      -- than curated substring. Word boundary enforced via space-padding so
      -- "Oak Hill" doesn't match "Oak Hills", "Mesa Country" doesn't match
      -- "Lamesa Country", etc. Min candidate length 8 chars to avoid generic
      -- single-word matches.
      SELECT id, name, 'substring_osm' AS match_type, 0.78::numeric AS confidence, 3 AS rank
      FROM courses
      WHERE is_curated = false
        AND osm_id IS NOT NULL
        AND ' ' || LOWER(name) || ' ' LIKE '% ' || LOWER(${trimmed}) || ' %'
        AND LOWER(name) != LOWER(${trimmed})
        AND length(${trimmed}) >= 8
        AND length(name) > length(${trimmed})
    )
    SELECT id, name, match_type, confidence
    FROM candidates
    -- Within same rank, prefer the shortest name (more canonical / less generic),
    -- then deterministic by name to avoid arbitrary tiebreaks.
    ORDER BY rank ASC, length(name) ASC, name ASC
    LIMIT 1
  `)) as unknown as {
    rows: Array<{ id: string; name: string; match_type: string; confidence: string }>;
  };

  const row = result.rows[0];
  if (!row) return null;

  return {
    courseId: row.id,
    courseName: row.name,
    matchType: row.match_type as "exact_name" | "alias" | "substring" | "substring_osm",
    confidence: Number(row.confidence),
  };
}
