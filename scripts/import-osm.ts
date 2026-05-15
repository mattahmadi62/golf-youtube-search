import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { courses } from "../src/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const QUERY = `
[out:json][timeout:900];
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  node["leisure"="golf_course"](area.us);
  way["leisure"="golf_course"](area.us);
  relation["leisure"="golf_course"](area.us);
);
out tags center;
`;

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

function kebab(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "-and-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

const USER_AGENT =
  "golf-youtube-search/0.1 (https://github.com/mattahmadi62/golf-youtube-search)";

async function fetchOSM(): Promise<OverpassElement[]> {
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Trying ${new URL(endpoint).hostname}...`);
    const start = Date.now();
    try {
      const url = `${endpoint}?data=${encodeURIComponent(QUERY)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as OverpassResponse;
      console.log(
        `  → ${data.elements.length} elements in ${((Date.now() - start) / 1000).toFixed(1)}s`,
      );
      return data.elements;
    } catch (err) {
      console.log(`  → failed: ${err instanceof Error ? err.message : String(err)}`);
      lastErr = err;
    }
  }
  throw new Error(`All Overpass endpoints failed. Last: ${String(lastErr)}`);
}

type Row = {
  name: string;
  slug: string;
  state: string | null;
  lat: number | null;
  lng: number | null;
  osmId: number;
};

function normalize(elements: OverpassElement[]): Row[] {
  const rows: Row[] = [];
  const seenOsm = new Set<number>();
  let skippedUnnamed = 0;
  let skippedDup = 0;

  for (const el of elements) {
    const name = el.tags?.name?.trim();
    if (!name) {
      skippedUnnamed++;
      continue;
    }
    if (seenOsm.has(el.id)) {
      skippedDup++;
      continue;
    }
    seenOsm.add(el.id);

    const lat = el.lat ?? el.center?.lat ?? null;
    const lon = el.lon ?? el.center?.lon ?? null;
    const state = el.tags?.["addr:state"] ?? null;

    rows.push({
      name,
      slug: kebab(name),
      state,
      lat,
      lng: lon,
      osmId: el.id,
    });
  }

  console.log(
    `Named: ${rows.length}, skipped unnamed: ${skippedUnnamed}, dup ids: ${skippedDup}`,
  );

  // Disambiguate slug collisions by appending -osm-{id} where the same slug appears more than once
  const slugCounts = new Map<string, number>();
  for (const r of rows) slugCounts.set(r.slug, (slugCounts.get(r.slug) ?? 0) + 1);
  let disambiguated = 0;
  for (const r of rows) {
    if ((slugCounts.get(r.slug) ?? 0) > 1) {
      r.slug = `${r.slug}-osm-${r.osmId}`;
      disambiguated++;
    }
  }
  console.log(`Disambiguated ${disambiguated} slug collisions.`);

  return rows;
}

async function insertAll(rows: Row[]): Promise<void> {
  const sqlClient = neon(DATABASE_URL!);
  const db = drizzle({ client: sqlClient });

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await db
      .insert(courses)
      .values(
        chunk.map((r) => ({
          name: r.name,
          slug: r.slug,
          state: r.state,
          country: "US",
          lat: r.lat?.toString() ?? null,
          lng: r.lng?.toString() ?? null,
          osmId: r.osmId,
          isCurated: false,
        })),
      )
      .onConflictDoNothing({ target: courses.slug });
    inserted += chunk.length;
    process.stdout.write(`\rInserted/upserted ${inserted}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  const elements = await fetchOSM();
  const rows = normalize(elements);
  console.log(`\nInserting ${rows.length} rows...`);
  await insertAll(rows);
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nImport failed:", err);
  process.exit(1);
});
