import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = neon(DATABASE_URL);

const statements: { label: string; query: string }[] = [
  {
    label: "extension pg_trgm",
    query: "CREATE EXTENSION IF NOT EXISTS pg_trgm",
  },
  {
    label: "GIN index on courses.name (trigram)",
    query:
      "CREATE INDEX IF NOT EXISTS courses_name_trgm_idx ON courses USING gin (name gin_trgm_ops)",
  },
  {
    label: "GIN index on courses.aliases (trigram)",
    query:
      "CREATE INDEX IF NOT EXISTS courses_aliases_trgm_idx ON courses USING gin (aliases)",
  },
];

async function main() {
  for (const { label, query } of statements) {
    process.stdout.write(`→ ${label} ... `);
    await sql.query(query);
    process.stdout.write("ok\n");
  }
  console.log("\nDone. Extensions and trigram indexes are in place.");
}

main().catch((err) => {
  console.error("\nBootstrap failed:", err);
  process.exit(1);
});
