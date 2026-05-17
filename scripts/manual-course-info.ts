/**
 * One-shot manual data fill for high-profile courses whose OSM record
 * is data-sparse (just a node with no website/phone/address tags).
 * These are the courses most likely to appear in launch screenshots and
 * Reddit examples, so worth filling by hand.
 *
 * Only fills NULL columns — won't overwrite existing data from OSM backfill.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

type Manual = {
  slug: string;
  website?: string;
  phone?: string;
  address?: string;
  accessType?: "public" | "private" | "resort" | "semi-private";
  holeCount?: number;
  description?: string;
};

const ENTRIES: Manual[] = [
  // ───── SoCal anchors (already video-anchored, in Reddit examples) ─────
  {
    slug: "sherwood-country-club",
    website: "https://www.sherwoodcc.com/",
    phone: "(805) 496-3036",
    address: "320 W Stafford Rd, Thousand Oaks, CA 91361",
    accessType: "private",
    holeCount: 18,
    description: "Jack Nicklaus-designed private club in Thousand Oaks, host of the Hero World Challenge.",
  },

  // ───── Major destinations / venues ─────
  {
    slug: "marriott-worsley-park",
    website: "https://www.marriott.com/hotels/travel/mansy-marriott-worsley-park-hotel-and-country-club/",
    phone: "+44 161 975 2000",
    address: "Worsley Park, Walkden Rd, Worsley, Manchester M28 2QT, UK",
    accessType: "resort",
    holeCount: 18,
    description: "Parkland resort course in Greater Manchester, Rick Shiels' home club and YouTube's most-filmed UK course.",
  },
  {
    slug: "pebble-beach-golf-links",
    website: "https://www.pebblebeach.com/golf/pebble-beach-golf-links/",
    phone: "(800) 877-0597",
    address: "1700 17 Mile Dr, Pebble Beach, CA 93953",
    accessType: "resort",
    holeCount: 18,
    description: "Iconic public-resort links on Carmel Bay. Annual host of the AT&T Pebble Beach Pro-Am; 2027 U.S. Open venue.",
  },
  {
    slug: "st-andrews-old-course",
    website: "https://www.standrews.com/play/courses/old-course",
    phone: "+44 1334 466666",
    address: "West Sands Rd, St Andrews KY16 9XL, Scotland, UK",
    accessType: "public",
    holeCount: 18,
    description: "The Home of Golf. The original links, in continuous play since the 1400s.",
  },
  {
    slug: "augusta-national-golf-club",
    website: "https://www.masters.com/",
    phone: "(706) 667-6000",
    address: "2604 Washington Rd, Augusta, GA 30904",
    accessType: "private",
    holeCount: 18,
    description: "Bobby Jones' and Alister MacKenzie's masterpiece. Annual host of The Masters.",
  },

  // ───── Resort destinations ─────
  {
    slug: "bandon-dunes-resort",
    website: "https://bandondunesgolf.com/",
    phone: "(541) 347-4380",
    address: "57744 Round Lake Dr, Bandon, OR 97411",
    accessType: "resort",
    description: "Mike Keiser's destination links resort on the Oregon coast — Bandon Dunes, Pacific Dunes, Old Macdonald, Bandon Trails, Sheep Ranch.",
  },
  {
    slug: "pinehurst-resort",
    website: "https://www.pinehurst.com/",
    phone: "(855) 309-1641",
    address: "1 Carolina Vista Dr, Pinehurst, NC 28374",
    accessType: "resort",
    description: "Nine-course resort in the North Carolina Sandhills. Home of Pinehurst No. 2 — 2024, 2029, 2035, 2041, 2047 U.S. Open host.",
  },
  {
    slug: "pinehurst-no-2",
    website: "https://www.pinehurst.com/golf/courses/no-2/",
    phone: "(855) 309-1641",
    address: "1 Carolina Vista Dr, Pinehurst, NC 28374",
    accessType: "resort",
    holeCount: 18,
    description: "Donald Ross' masterwork. Restored by Coore & Crenshaw in 2011. Anchor course of the Pinehurst Resort.",
  },
  {
    slug: "streamsong-resort",
    website: "https://www.streamsongresort.com/",
    phone: "(844) 727-8453",
    address: "1000 Streamsong Dr, Bowling Green, FL 33834",
    accessType: "resort",
    description: "Modern Florida destination resort. Streamsong Red (Coore & Crenshaw), Blue (Doak), Black (Hanse).",
  },
  {
    slug: "sand-valley-resort",
    website: "https://sandvalley.com/",
    phone: "(888) 651-5539",
    address: "1697 Leopold Way, Nekoosa, WI 54457",
    accessType: "resort",
    description: "Wisconsin sandscape resort — Sand Valley, Mammoth Dunes, The Lido, Sedge Valley.",
  },
  {
    slug: "big-cedar-lodge",
    website: "https://bigcedar.com/golf/",
    phone: "(800) 225-6343",
    address: "190 Top of the Rock Rd, Ridgedale, MO 65739",
    accessType: "resort",
    description: "Johnny Morris' Ozarks golf destination. Payne's Valley (Tiger Woods Design), Top of the Rock, Ozark National.",
  },
  {
    slug: "casa-de-campo",
    website: "https://www.casadecampo.com.do/golf/",
    phone: "+1 809-523-3333",
    address: "Casa de Campo, La Romana, Dominican Republic",
    accessType: "resort",
    description: "Caribbean resort destination. Pete Dye's Teeth of the Dog, Dye Fore, The Links.",
  },

  // ───── UK majors / Open venues ─────
  {
    slug: "royal-liverpool",
    website: "https://www.royal-liverpool-golf.com/",
    phone: "+44 151 632 3101",
    address: "Meols Dr, Hoylake, Wirral CH47 4AL, UK",
    accessType: "private",
    holeCount: 18,
    description: "Open Championship venue on the Wirral Peninsula. Most recent Open: 2023.",
  },
  {
    slug: "royal-birkdale",
    website: "https://www.royalbirkdale.com/",
    phone: "+44 1704 567920",
    address: "Waterloo Rd, Birkdale, Southport PR8 2LX, UK",
    accessType: "private",
    holeCount: 18,
    description: "Open Championship venue on the Sefton coast. Hosted 10 Opens.",
  },
  {
    slug: "carnoustie",
    website: "https://www.carnoustiegolflinks.com/",
    phone: "+44 1241 802270",
    address: "20 Links Parade, Carnoustie DD7 7JE, Scotland, UK",
    accessType: "public",
    holeCount: 18,
    description: "Public-access links. Site of Jean van de Velde's 1999 Open meltdown and Padraig Harrington's 2007 victory.",
  },
  {
    slug: "royal-troon",
    website: "https://www.royaltroon.com/",
    phone: "+44 1292 311555",
    address: "Craigend Rd, Troon KA10 6EP, Scotland, UK",
    accessType: "private",
    description: "2024 Open Championship venue. Home of the famous 'Postage Stamp' 8th hole.",
  },

  // ───── Major-name US ─────
  {
    slug: "los-angeles-country-club",
    website: "https://thelacc.org/",
    phone: "(310) 276-6104",
    address: "10101 Wilshire Blvd, Los Angeles, CA 90024",
    accessType: "private",
    description: "Storied LA private club. 2023 U.S. Open venue; 2039 U.S. Open future host.",
  },
  {
    slug: "shinnecock-hills-golf-club",
    website: "https://shinnecockhills.org/",
    phone: "(631) 283-3525",
    address: "200 Tuckahoe Rd, Southampton, NY 11968",
    accessType: "private",
    holeCount: 18,
    description: "Founding USGA club (1894). Five-time U.S. Open host; 2026 U.S. Open future venue.",
  },
];

async function main() {
  const sql = neon(DATABASE_URL!);

  let updated = 0;
  let missing = 0;
  for (const e of ENTRIES) {
    const existing = await sql`SELECT id, website, phone, address, access_type, hole_count, description FROM courses WHERE slug = ${e.slug}`;
    if (!existing[0]) {
      console.log(`  ✗ slug not found: ${e.slug}`);
      missing++;
      continue;
    }
    const row = existing[0] as any;
    await sql`
      UPDATE courses SET
        website     = COALESCE(website,     ${e.website ?? null}),
        phone       = COALESCE(phone,       ${e.phone ?? null}),
        address     = COALESCE(address,     ${e.address ?? null}),
        access_type = COALESCE(access_type, ${e.accessType ?? null}),
        hole_count  = COALESCE(hole_count,  ${e.holeCount ?? null}),
        description = COALESCE(description, ${e.description ?? null})
      WHERE id = ${row.id}
    `;
    updated++;
    console.log(`  ✓ ${e.slug}`);
  }
  console.log(`\nDone. Updated ${updated}, missing ${missing}.`);
}

main().catch((err) => {
  console.error("Manual fill failed:", err);
  process.exit(1);
});
