import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SearchResult = {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  is_curated: boolean;
  parent_name: string | null;
  parent_slug: string | null;
  video_count: number;
  sim: number;
  match_quality: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Combine three matching signals:
  //   1. ILIKE prefix on the canonical name (catches "Peb" → Pebble)
  //   2. ILIKE prefix on any alias (catches "PJ Nat" → PGA National)
  //   3. pg_trgm similarity on the name (catches typos / mishears)
  // Rank: curated first, then by indexed video count, then by similarity.
  const result = (await db.execute(sql`
    WITH q AS (SELECT ${q}::text AS term, LOWER(${q}::text) AS term_lower)
    SELECT
      c.id,
      c.name,
      c.slug,
      c.state,
      c.is_curated,
      p.name AS parent_name,
      p.slug AS parent_slug,
      (SELECT COUNT(*)::int FROM video_courses WHERE course_id = c.id) AS video_count,
      GREATEST(
        similarity(c.name, (SELECT term FROM q)),
        COALESCE((SELECT MAX(similarity(a, (SELECT term FROM q))) FROM unnest(c.aliases) AS a), 0)
      ) AS sim,
      -- match_quality: 3 = exact name/alias, 2 = prefix match, 1 = trigram-only
      CASE
        WHEN LOWER(c.name) = (SELECT term_lower FROM q) THEN 3
        WHEN EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE LOWER(a) = (SELECT term_lower FROM q)) THEN 3
        WHEN c.name ILIKE (SELECT term FROM q) || '%' THEN 2
        WHEN EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE a ILIKE (SELECT term FROM q) || '%') THEN 2
        ELSE 1
      END AS match_quality
    FROM courses c
    LEFT JOIN courses p ON p.id = c.parent_course_id
    WHERE
      c.name ILIKE (SELECT term FROM q) || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(c.aliases) a WHERE a ILIKE (SELECT term FROM q) || '%'
      )
      OR similarity(c.name, (SELECT term FROM q)) > 0.35
    ORDER BY
      -- exact name/alias hits first, then prefix matches, then trigram
      match_quality DESC,
      c.is_curated DESC,
      (SELECT COUNT(*)::int FROM video_courses WHERE course_id = c.id) DESC,
      sim DESC,
      c.name
    LIMIT 10
  `)) as unknown as { rows: SearchResult[] };

  return NextResponse.json({ results: result.rows });
}
