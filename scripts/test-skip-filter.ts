import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { shouldSkipForExtraction } from "../src/lib/skip-filter";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`SELECT title FROM videos LIMIT 10000`) as Array<{ title: string }>;
  let skip = 0;
  const samples: string[] = [];
  for (const r of rows) {
    if (shouldSkipForExtraction(r.title)) {
      skip++;
      if (samples.length < 15) samples.push(r.title);
    }
  }
  console.log(
    `Total: ${rows.length} | Skip: ${skip} (${((100 * skip) / rows.length).toFixed(1)}%) | Keep: ${rows.length - skip}`,
  );
  console.log("\nSamples skipped:");
  for (const t of samples) console.log("  • " + t.slice(0, 90));
}

main();
