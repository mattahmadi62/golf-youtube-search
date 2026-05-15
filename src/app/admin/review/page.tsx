import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { extractionReviewQueue, videos } from "@/db/schema";

export const dynamic = "force-dynamic";

type GroupedCandidate = {
  candidateName: string;
  count: number;
  exampleEvidence: string | null;
  sampleVideo: { ytVideoId: string; title: string } | null;
  suggestions: Array<{ name: string; slug: string; state: string | null; sim: number }>;
};

async function getReviewQueue(): Promise<{
  total: number;
  grouped: GroupedCandidate[];
}> {
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(extractionReviewQueue)
    .where(eq(extractionReviewQueue.status, "pending"));

  // Group by candidate name and pull one example evidence/video per group.
  const groupedRows = (await db.execute(sql`
    WITH grouped AS (
      SELECT
        candidate_name,
        COUNT(*) AS cnt,
        (ARRAY_AGG(evidence ORDER BY created_at DESC))[1] AS example_evidence,
        (ARRAY_AGG(video_id ORDER BY created_at DESC))[1] AS sample_video_id
      FROM extraction_review_queue
      WHERE status = 'pending'
      GROUP BY candidate_name
    )
    SELECT g.candidate_name, g.cnt, g.example_evidence,
           v.yt_video_id, v.title AS video_title
    FROM grouped g
    LEFT JOIN videos v ON v.id = g.sample_video_id
    ORDER BY g.cnt DESC, g.candidate_name ASC
    LIMIT 100
  `)) as unknown as {
    rows: Array<{
      candidate_name: string;
      cnt: number;
      example_evidence: string | null;
      yt_video_id: string | null;
      video_title: string | null;
    }>;
  };

  // For each candidate, fetch top-3 fuzzy course suggestions (no state filter
  // here since extraction doesn't carry one — pg_trgm across the full table).
  const grouped: GroupedCandidate[] = [];
  for (const row of groupedRows.rows) {
    const suggestions = (await db.execute(sql`
      SELECT name, slug, state, similarity(name, ${row.candidate_name}) AS sim
      FROM courses
      WHERE similarity(name, ${row.candidate_name}) > 0.4
      ORDER BY sim DESC, is_curated DESC
      LIMIT 3
    `)) as unknown as {
      rows: Array<{ name: string; slug: string; state: string | null; sim: number }>;
    };

    grouped.push({
      candidateName: row.candidate_name,
      count: row.cnt,
      exampleEvidence: row.example_evidence,
      sampleVideo:
        row.yt_video_id && row.video_title
          ? { ytVideoId: row.yt_video_id, title: row.video_title }
          : null,
      suggestions: suggestions.rows.map((s) => ({ ...s, sim: Number(s.sim) })),
    });
  }

  return { total: totalRow?.count ?? 0, grouped };
}

export default async function ReviewPage() {
  const { total, grouped } = await getReviewQueue();

  return (
    <main className="min-h-dvh bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-baseline justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Admin
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Extraction review queue
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Candidate course names the LLM extracted that didn't match an existing course.
              Top suggestions come from pg_trgm similarity against all 13k courses.
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-mono tabular-nums text-zinc-900 dark:text-zinc-50">
              {total.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">pending</p>
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
            Nothing to review.
          </div>
        ) : (
          <ul className="space-y-3">
            {grouped.map((g) => (
              <li
                key={g.candidateName}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">
                    {g.candidateName}
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                    {g.count}× mentioned
                  </span>
                </div>

                {g.exampleEvidence && (
                  <p className="mt-2 text-sm italic text-zinc-600 dark:text-zinc-400">
                    “{g.exampleEvidence}”
                  </p>
                )}

                {g.sampleVideo && (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                    e.g.{" "}
                    <a
                      href={`https://www.youtube.com/watch?v=${g.sampleVideo.ytVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      {g.sampleVideo.title}
                    </a>
                  </p>
                )}

                {g.suggestions.length > 0 && (
                  <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
                      Suggested matches
                    </p>
                    <ul className="space-y-1">
                      {g.suggestions.map((s) => (
                        <li
                          key={s.slug}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <Link
                            href={`/course/${s.slug}`}
                            className="text-zinc-900 hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
                          >
                            {s.name}
                            {s.state && (
                              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-500">
                                {s.state}
                              </span>
                            )}
                          </Link>
                          <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                            {s.sim.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-12 text-xs text-zinc-500 dark:text-zinc-500">
          To resolve: add the candidate name as an alias under the right course in{" "}
          <code className="font-mono">data/curated-courses.json</code>, then re-run{" "}
          <code className="font-mono">pnpm seed:curated</code> and{" "}
          <code className="font-mono">pnpm extract:courses</code>.
        </p>
      </div>
    </main>
  );
}
