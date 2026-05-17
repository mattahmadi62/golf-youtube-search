/**
 * One-shot backfill: fetch website/phone/address/holes/access tags from
 * OpenStreetMap for courses that have an osm_id. Uses the Overpass API.
 *
 * Strategy:
 *   1. Get all (osm_id, type) pairs from our DB. OSM IDs can refer to ways,
 *      nodes, or relations — we don't store the type. We try way first
 *      (most courses are polygons), then fall back to node/relation.
 *   2. Batch by 200 to keep Overpass queries reasonable.
 *   3. Parse tags into our schema fields. Update only fields where we have
 *      a value AND the existing DB column is NULL (don't overwrite manual edits).
 *
 * Limit with --top N to process only the N courses with the most videos
 * (good for a quick pre-launch pass).
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const TOP_FLAG_IDX = process.argv.indexOf("--top");
const TOP_N = TOP_FLAG_IDX !== -1 ? parseInt(process.argv[TOP_FLAG_IDX + 1], 10) : null;
const APPLY = process.argv.includes("--apply");

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type OsmTags = Record<string, string>;
type OsmElement = { type: "node" | "way" | "relation"; id: number; tags?: OsmTags };

function buildAddress(t: OsmTags): string | null {
  const parts: string[] = [];
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  if (street) parts.push(street);
  if (t["addr:unit"]) parts.push(t["addr:unit"]);
  const cityState = [t["addr:city"], t["addr:state"]].filter(Boolean).join(", ");
  const cityStateZip = [cityState, t["addr:postcode"]].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function parseTags(t: OsmTags): {
  website: string | null;
  phone: string | null;
  address: string | null;
  holeCount: number | null;
  accessType: string | null;
} {
  const website = t["website"] || t["contact:website"] || t["url"] || null;
  const phone = t["phone"] || t["contact:phone"] || null;
  const address = buildAddress(t);
  const holesRaw = t["holes"] || t["golf:holes"] || null;
  const holes = holesRaw && /^\d+$/.test(holesRaw) ? parseInt(holesRaw, 10) : null;
  const accessRaw = (t["access"] || t["golf:access"] || "").toLowerCase();
  const accessMap: Record<string, string> = {
    yes: "public",
    public: "public",
    private: "private",
    customers: "resort",
    members: "private",
    permissive: "public",
    permit: "semi-private",
    no: "private",
  };
  const accessType = accessMap[accessRaw] ?? null;
  return { website, phone, address, holeCount: holes, accessType };
}

async function overpassFetch(osmIds: number[]): Promise<OsmElement[]> {
  // Try fetching as way (most common), then fall back to node and relation.
  const idList = osmIds.join(",");
  const q = `
    [out:json][timeout:60];
    (
      way(id:${idList});
      node(id:${idList});
      relation(id:${idList});
    );
    out tags;
  `;
  const r = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "caddiereel/1.0 (mailto:feedback@caddiereel.com)",
    },
    body: "data=" + encodeURIComponent(q),
  });
  if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
  const data = (await r.json()) as { elements: OsmElement[] };
  return data.elements ?? [];
}

async function main() {
  const sql = neon(DATABASE_URL!);

  // Pick the candidate set. Default = all OSM courses missing all fields.
  // If --top N, restrict to the top N by video count.
  let query;
  if (TOP_N !== null) {
    query = await sql`
      SELECT c.id, c.osm_id, c.website, c.phone, c.address, c.hole_count, c.access_type,
             (SELECT count(*) FROM video_courses WHERE course_id = c.id) AS videos
      FROM courses c
      WHERE c.osm_id IS NOT NULL
      ORDER BY (SELECT count(*) FROM video_courses WHERE course_id = c.id) DESC
      LIMIT ${TOP_N}
    `;
  } else {
    query = await sql`
      SELECT id, osm_id, website, phone, address, hole_count, access_type
      FROM courses
      WHERE osm_id IS NOT NULL
        AND (website IS NULL OR phone IS NULL OR address IS NULL OR hole_count IS NULL OR access_type IS NULL)
    `;
  }
  const rows = query as Array<{
    id: string;
    osm_id: number;
    website: string | null;
    phone: string | null;
    address: string | null;
    hole_count: number | null;
    access_type: string | null;
  }>;

  console.log(`Candidates: ${rows.length}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "dry-run"}`);

  // Build osmId -> { ourId, currentFields }. Normalize to number both ways —
  // neon-http returns bigint columns as strings; Overpass JSON returns numbers.
  const byOsmId = new Map<number, (typeof rows)[number]>();
  for (const r of rows) byOsmId.set(Number(r.osm_id), r);

  const BATCH = 200;
  const osmIds = Array.from(byOsmId.keys());
  let touched = 0;
  let withWebsite = 0;
  let withPhone = 0;
  let withAddress = 0;
  let withHoles = 0;
  let withAccess = 0;
  const samples: string[] = [];

  for (let i = 0; i < osmIds.length; i += BATCH) {
    const chunk = osmIds.slice(i, i + BATCH);
    let elements: OsmElement[] = [];
    try {
      elements = await overpassFetch(chunk);
    } catch (e) {
      console.error(`  batch ${i}: overpass failed — ${String(e).slice(0, 80)}`);
      // Brief backoff and retry once
      await new Promise((r) => setTimeout(r, 5000));
      try {
        elements = await overpassFetch(chunk);
      } catch (e2) {
        console.error(`  batch ${i}: retry also failed; skipping`);
        continue;
      }
    }

    for (const el of elements) {
      const row = byOsmId.get(el.id);
      if (!row) continue;
      const t = el.tags ?? {};
      const parsed = parseTags(t);
      const updates: Partial<{
        website: string;
        phone: string;
        address: string;
        hole_count: number;
        access_type: string;
      }> = {};
      if (parsed.website && !row.website) updates.website = parsed.website;
      if (parsed.phone && !row.phone) updates.phone = parsed.phone;
      if (parsed.address && !row.address) updates.address = parsed.address;
      if (parsed.holeCount !== null && !row.hole_count) updates.hole_count = parsed.holeCount;
      if (parsed.accessType && !row.access_type) updates.access_type = parsed.accessType;

      if (Object.keys(updates).length === 0) continue;
      touched++;
      if (updates.website) withWebsite++;
      if (updates.phone) withPhone++;
      if (updates.address) withAddress++;
      if (updates.hole_count !== undefined) withHoles++;
      if (updates.access_type) withAccess++;

      if (samples.length < 12) {
        const summary = Object.entries(updates)
          .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v.slice(0, 40)}"` : v}`)
          .join(" ");
        samples.push(`  • osm=${el.id}: ${summary}`);
      }

      if (APPLY) {
        await sql`
          UPDATE courses SET
            website      = COALESCE(${updates.website ?? null}, website),
            phone        = COALESCE(${updates.phone ?? null}, phone),
            address      = COALESCE(${updates.address ?? null}, address),
            hole_count   = COALESCE(${updates.hole_count ?? null}, hole_count),
            access_type  = COALESCE(${updates.access_type ?? null}, access_type)
          WHERE id = ${row.id}
        `;
      }
    }

    process.stdout.write(`\r  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(osmIds.length / BATCH)}  touched=${touched}   `);
    // Rate-limit politely (Overpass: 2 queries per minute is safe)
    await new Promise((r) => setTimeout(r, 1500));
  }
  process.stdout.write("\n");

  console.log(`\nResults:`);
  console.log(`  Rows with any new field:  ${touched}`);
  console.log(`  + website:                 ${withWebsite}`);
  console.log(`  + phone:                   ${withPhone}`);
  console.log(`  + address:                 ${withAddress}`);
  console.log(`  + holes:                   ${withHoles}`);
  console.log(`  + access:                  ${withAccess}`);
  console.log(`\nSample updates:`);
  for (const s of samples) console.log(s);
  if (!APPLY) console.log(`\n(dry run — pass --apply to write)`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
