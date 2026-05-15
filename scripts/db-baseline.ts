/**
 * One-shot helper to mark already-applied migrations as recorded in
 * drizzle.__drizzle_migrations. Used when bootstrapping the migration log on
 * a DB whose schema was created via `drizzle-kit push` before we switched to
 * the generate+migrate workflow.
 *
 * Safe to re-run: only inserts rows whose `created_at` (folderMillis from
 * the journal) is newer than the latest already-recorded row.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

async function main() {
  const sql = neon(DATABASE_URL!);

  await sql.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const journalPath = path.resolve(process.cwd(), "drizzle/meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;

  const latest = (await sql.query(
    `SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
  )) as Array<{ created_at: string | number | null }>;
  const lastWhen = latest[0]?.created_at != null ? Number(latest[0].created_at) : -1;

  let inserted = 0;
  for (const entry of journal.entries) {
    if (entry.when <= lastWhen) continue;
    const file = path.resolve(process.cwd(), `drizzle/${entry.tag}.sql`);
    const content = await readFile(file, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    await sql.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, entry.when],
    );
    console.log(`Recorded ${entry.tag} (when=${entry.when})`);
    inserted++;
  }

  if (inserted === 0) {
    console.log("Nothing to record — migration log is up to date.");
  } else {
    console.log(`Recorded ${inserted} migration(s) as already applied.`);
  }
}

main().catch((err) => {
  console.error("Baseline failed:", err);
  process.exit(1);
});
