import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

/**
 * Match an extracted course name against the courses table.
 *
 * Strategy:
 *   1. Exact case-insensitive match against `name` → confidence 1.0
 *   2. Case-insensitive match against any element of `aliases` → 0.95
 *   3. Bidirectional substring match against curated courses only
 *      (extracted ⊂ canonical OR canonical ⊂ extracted) → 0.85
 *   4. No match — caller routes to the review queue.
 *
 * Pure fuzzy matching across all 13K rows produced too many false positives
 * during M2 (e.g., "Sun Valley" ↔ "Payne's Valley"), so we deliberately keep
 * the matcher conservative and let the review queue handle the rest.
 */
export type MatchResult =
  | { courseId: string; courseName: string; matchType: "exact_name" | "alias" | "substring"; confidence: number }
  | null;

export async function matchCourse(
  db: ReturnType<typeof drizzle>,
  extractedName: string,
): Promise<MatchResult> {
  const trimmed = extractedName.trim();
  if (!trimmed) return null;

  const result = (await db.execute(sql`
    WITH candidates AS (
      SELECT id, name, 'exact_name' AS match_type, 1.00::numeric AS confidence
      FROM courses
      WHERE LOWER(name) = LOWER(${trimmed})

      UNION ALL

      SELECT id, name, 'alias' AS match_type, 0.95::numeric AS confidence
      FROM courses
      WHERE EXISTS (
        SELECT 1 FROM unnest(aliases) AS a WHERE LOWER(a) = LOWER(${trimmed})
      )

      UNION ALL

      SELECT id, name, 'substring' AS match_type, 0.85::numeric AS confidence
      FROM courses
      WHERE is_curated = true
        AND (
          LOWER(name) LIKE LOWER('%' || ${trimmed} || '%')
          OR LOWER(${trimmed}) LIKE LOWER('%' || name || '%')
        )
        AND length(${trimmed}) >= 5
    )
    SELECT id, name, match_type, confidence
    FROM candidates
    ORDER BY confidence DESC
    LIMIT 1
  `)) as unknown as {
    rows: Array<{ id: string; name: string; match_type: string; confidence: string }>;
  };

  const row = result.rows[0];
  if (!row) return null;

  return {
    courseId: row.id,
    courseName: row.name,
    matchType: row.match_type as "exact_name" | "alias" | "substring",
    confidence: Number(row.confidence),
  };
}
