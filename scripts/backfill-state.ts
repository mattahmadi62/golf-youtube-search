/**
 * One-shot backfill: assign US state to OSM-imported course rows whose
 * state is NULL but lat/lng is set. Uses simple bounding boxes per state.
 * Bounding boxes overlap a bit at borders, so we pick the most-restrictive
 * containing box. For courses, this is accurate enough — courses are
 * almost always interior to their state, not on the border line.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

// [code, latMin, latMax, lngMin, lngMax] — conservative interior boxes.
// Source: USGS / public-domain US state bounding boxes.
const STATE_BOXES: ReadonlyArray<readonly [string, number, number, number, number]> = [
  ["AL", 30.137, 35.008, -88.473, -84.892],
  ["AK", 51.214, 71.541, -179.148, 179.778],
  ["AZ", 31.332, 37.004, -114.818, -109.045],
  ["AR", 33.004, 36.500, -94.617, -89.644],
  ["CA", 32.534, 42.009, -124.482, -114.131],
  ["CO", 36.993, 41.003, -109.060, -102.041],
  ["CT", 40.985, 42.050, -73.728, -71.787],
  ["DE", 38.451, 39.840, -75.789, -75.049],
  ["FL", 24.396, 31.001, -87.635, -79.974],
  ["GA", 30.355, 35.001, -85.605, -80.751],
  ["HI", 18.910, 28.402, -178.443, -154.806],
  ["ID", 41.988, 49.001, -117.243, -111.044],
  ["IL", 36.970, 42.508, -91.513, -87.494],
  ["IN", 37.772, 41.761, -88.098, -84.785],
  ["IA", 40.376, 43.501, -96.640, -90.140],
  ["KS", 36.993, 40.003, -102.052, -94.589],
  ["KY", 36.498, 39.147, -89.572, -81.965],
  ["LA", 28.929, 33.020, -94.043, -88.817],
  ["ME", 43.064, 47.460, -71.084, -66.949],
  ["MD", 37.886, 39.723, -79.488, -75.049],
  ["MA", 41.187, 42.887, -73.508, -69.928],
  ["MI", 41.696, 48.306, -90.418, -82.122],
  ["MN", 43.499, 49.385, -97.239, -89.491],
  ["MS", 30.174, 34.996, -91.655, -88.097],
  ["MO", 35.995, 40.611, -95.774, -89.099],
  ["MT", 44.358, 49.001, -116.050, -104.039],
  ["NE", 39.999, 43.001, -104.053, -95.308],
  ["NV", 35.001, 42.000, -120.005, -114.039],
  ["NH", 42.696, 45.305, -72.557, -70.610],
  ["NJ", 38.928, 41.357, -75.560, -73.893],
  ["NM", 31.332, 37.000, -109.050, -103.001],
  ["NY", 40.496, 45.015, -79.762, -71.856],
  ["NC", 33.842, 36.588, -84.322, -75.460],
  ["ND", 45.935, 49.001, -104.049, -96.554],
  ["OH", 38.403, 41.978, -84.820, -80.518],
  ["OK", 33.616, 37.002, -103.002, -94.431],
  ["OR", 41.992, 46.292, -124.566, -116.464],
  ["PA", 39.720, 42.270, -80.519, -74.690],
  ["RI", 41.146, 42.019, -71.862, -71.117],
  ["SC", 32.034, 35.215, -83.354, -78.541],
  ["SD", 42.480, 45.945, -104.058, -96.436],
  ["TN", 34.983, 36.678, -90.310, -81.647],
  ["TX", 25.837, 36.500, -106.646, -93.508],
  ["UT", 36.998, 42.001, -114.052, -109.041],
  ["VT", 42.727, 45.017, -73.437, -71.465],
  ["VA", 36.541, 39.466, -83.675, -75.242],
  ["WA", 45.544, 49.002, -124.733, -116.916],
  ["WV", 37.202, 40.638, -82.643, -77.719],
  ["WI", 42.492, 47.080, -92.889, -86.806],
  ["WY", 40.998, 45.006, -111.057, -104.052],
  ["DC", 38.791, 38.996, -77.119, -76.910],
];

function stateFor(lat: number, lng: number): string | null {
  // Box containment. If multiple match, prefer the smaller box (more specific).
  const matches: Array<{ code: string; area: number }> = [];
  for (const [code, latMin, latMax, lngMin, lngMax] of STATE_BOXES) {
    if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
      matches.push({ code, area: (latMax - latMin) * (lngMax - lngMin) });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.area - b.area);
  return matches[0].code;
}

async function main() {
  const sql = neon(DATABASE_URL!);

  const rows = (await sql`
    SELECT id, lat, lng FROM courses
    WHERE osm_id IS NOT NULL
      AND state IS NULL
      AND country = 'US'
      AND lat IS NOT NULL
      AND lng IS NOT NULL
  `) as Array<{ id: string; lat: string; lng: string }>;

  console.log(`Candidates: ${rows.length}`);

  const byState = new Map<string, string[]>();
  let unmatched = 0;
  for (const r of rows) {
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    const st = stateFor(lat, lng);
    if (!st) {
      unmatched++;
      continue;
    }
    const arr = byState.get(st) ?? [];
    arr.push(r.id);
    byState.set(st, arr);
  }

  console.log(`Matched: ${rows.length - unmatched} | Unmatched (no box): ${unmatched}`);
  console.log(`Distribution by state:`);
  const sorted = Array.from(byState.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [code, ids] of sorted.slice(0, 15)) console.log(`  ${code}: ${ids.length}`);
  if (sorted.length > 15) console.log(`  … and ${sorted.length - 15} more states`);

  let updated = 0;
  for (const [code, ids] of byState) {
    const BATCH = 500;
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const r = await sql`UPDATE courses SET state = ${code} WHERE id = ANY(${chunk}::uuid[]) RETURNING id`;
      updated += r.length;
    }
    process.stdout.write(`\r  updated ${updated}/${rows.length - unmatched}  `);
  }
  process.stdout.write("\n");
  console.log(`Done. Updated ${updated} rows.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
