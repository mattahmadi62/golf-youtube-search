# Golf YouTube — Search by Course

A search index for golf YouTube content keyed on **course**, not video title. The wedge: big golf channels (Bob Does Sports, Good Good, Grant Horvat, Bryan Bros, etc.) routinely title videos things like "WE PLAYED THE MOST EXCLUSIVE COURSE IN CALIFORNIA" without naming the course in any searchable metadata. The course is the content, but it's not in the title, description, or tags. This app fixes that.

## Goals (v1)

- Type a course name → see every indexed video shot at that course, with embedded player.
- Filter/sort by channel, recency.
- Cover the top ~50 golf YouTube channels' full catalogs.
- Public URL, sharable, no auth.

## Non-goals (v1)

- Map browsing (v2).
- Channel-centric pages ("every course Grant Horvat has played") (v3).
- SEO / organic discovery push.
- Tee-time affiliate links / monetization.
- User accounts, saves, watchlists.
- Mobile-native app.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Vercel-native, server components keep search pages fast, API routes for ingestion endpoints. |
| Hosting | Vercel | Frontend strength, zero-config, free tier viable. |
| Database | Postgres on Neon | Generous free tier, branching for safe schema changes, works perfectly with Vercel. |
| Search | Postgres full-text + `pg_trgm` for fuzzy | Avoids a separate Elastic/Meilisearch service for v1. Migrate if it gets slow. |
| ORM | Drizzle | Lightweight, good TS inference, painless migrations. |
| LLM | Claude (Haiku for bulk extract, Sonnet for ambiguous cases) | Strong extraction, JSON mode, captioned-video text fits in context easily. |
| YouTube data | YouTube Data API v3 (official) | Need to register a key (Google Cloud Console, free). |
| Captions | `youtube-transcript-api` or `yt-dlp` for auto-captions | Official API doesn't expose captions text directly without OAuth. |
| Job queue | Inngest or Trigger.dev (TBD) | Long-running LLM extraction needs to outlive a single HTTP request. Vercel cron is too thin. |
| Course geo data | OpenStreetMap (Overpass API) | Free, ~30k+ courses worldwide with lat/lng. Quality uneven but workable. |

**Open call:** Inngest vs Trigger.dev — both have free tiers. Inngest's local dev story is slightly nicer; Trigger has better long-task ergonomics. Decide when we get there.

## Data model

```
courses
  id              uuid pk
  name            text                  -- canonical display name
  aliases         text[]                -- ["Cypress Point", "Cypress Point Club", "CPC"]
  slug            text unique           -- "cypress-point-club"
  country         text
  state           text                  -- nullable, US-only fill for v1
  lat             numeric
  lng             numeric
  osm_id          bigint nullable       -- source link back to OSM
  is_curated      bool                  -- true if hand-added or hand-verified
  created_at      timestamptz

channels
  id              uuid pk
  yt_channel_id   text unique
  handle          text                  -- "@goodgood"
  name            text
  subscriber_ct   int                   -- snapshot, refresh periodically
  last_synced_at  timestamptz

videos
  id              uuid pk
  yt_video_id     text unique
  channel_id      uuid fk -> channels
  title           text
  description     text
  published_at    timestamptz
  duration_s      int
  thumbnail_url   text
  view_count      bigint
  captions_text   text                  -- concatenated auto-caption text, nullable
  extracted_at    timestamptz nullable  -- when we last ran LLM extraction
  extraction_model text                 -- "claude-haiku-4-5" etc., for audit

video_courses                            -- the actual product join
  video_id        uuid fk -> videos
  course_id       uuid fk -> courses
  confidence      numeric                -- 0..1 from extraction
  source          text                   -- "title" | "description" | "captions" | "manual"
  evidence        text                   -- the snippet that triggered the match
  pk (video_id, course_id)

extraction_review_queue                  -- unmatched candidates
  id              uuid pk
  video_id        uuid fk -> videos
  candidate_name  text                   -- raw string LLM extracted
  evidence        text
  status          text                   -- "pending" | "linked" | "rejected" | "new_course"
  resolved_course_id uuid nullable fk
  created_at      timestamptz
```

**Why a review queue:** the LLM will extract names like "Saticoy" that don't exactly match anything in OSM, or it'll invent things from misheard captions. We need a triage surface, not just trust scores in production.

## Course catalog strategy (hybrid)

1. **Base layer — OpenStreetMap.** One-shot Overpass query for `leisure=golf_course` worldwide. Imports ~30k rows with `osm_id`, name, lat/lng. Maybe 60-70% have clean names; the rest are "Golf Course" or country-language only. Fine.
2. **Curated layer — ~500 notable US courses.** Hand-seeded JSON file in the repo: Top 100 publics, Top 100 privates, every course that's appeared on a big YouTube channel in the last 2 years. These get `is_curated=true`. Aliases pre-filled (Pebble = Pebble Beach Golf Links, etc.). This is what powers autocomplete and ranks first in search results.
3. **Discovery layer — review queue.** LLM extracts course names freely. We fuzzy-match (pg_trgm + manual rules for "GC" → "Golf Club", etc.) against base + curated. Anything below a confidence threshold lands in `extraction_review_queue` for human triage. Triage actions: link to existing course, create new curated course, or reject as noise.

This means we don't need a perfect upfront list. The index grows from the videos themselves.

## Ingestion pipeline

Run as background jobs (Inngest/Trigger), not request-time. One pipeline, fan out per channel:

```
for each channel in seed list:
  1. List uploads playlist via YouTube API     [cheap, 1 quota unit per 50 videos]
  2. For each new video:
     a. Fetch video metadata (title, desc, etc.) [1 quota unit]
     b. Fetch auto-captions (yt-dlp)             [free, just bandwidth]
     c. Concat: title + description + captions
     d. Send to Claude Haiku with extraction prompt
     e. Parse JSON response: [{ name, evidence, confidence }]
     f. For each candidate:
        - Fuzzy-match against courses table
        - If match (sim > 0.85): insert into video_courses
        - Else: insert into extraction_review_queue
     g. Mark video extracted_at = now()
```

**Extraction prompt sketch:**
> You're given the title, description, and auto-caption transcript of a golf YouTube video. List every golf course that appears to be played in or substantially discussed in this video. For each, return the course name as stated, a short evidence snippet, and a confidence 0-1. Return JSON only. If no courses are identifiable, return [].

**Backfill strategy:** for the top 50 channels with ~200 videos each on average = ~10k videos. At Haiku pricing with reasonably long caption contexts, the one-time backfill should be cheap (probably <$30). Don't optimize — just run it.

**Refresh:** daily cron per channel, only process videos with `published_at > channel.last_synced_at`.

**Channel seed list:** start with a hand-curated JSON of ~50 channels (Good Good, Bob Does Sports, Grant Horvat, Bryan Bros, GM Golf, Foreplay, Erik Anders Lang/Random Golf Club, Rick Shiels, etc.). Add a Postgres `channels.added_by` field for community-suggested additions later.

## Routes / surface area (v1)

```
/                          home — recent videos, popular courses, search bar
/search?q=...              search results page
/course/[slug]             course page — videos shot there, sortable
/channel/[handle]          channel page — basic, lists videos (v3 surface for free)
/admin/review              private review queue (basic auth via env var for v1)
/api/ingest/[channelId]    POST, kicks off ingestion for a channel
/api/extract/[videoId]     POST, re-runs extraction on one video
```

`/admin/review` is the unglamorous but critical surface — it's where the data quality lives or dies.

## Milestones / build order

**M0 — Plan locked.** (You're here.)

**M1 — Skeleton (1 evening).** Next.js app on Vercel, Neon DB connected, Drizzle migrations running, empty schema deployed, deploy URL live.

**M2 — Course catalog seeded (1 evening).** Overpass import script. Curated JSON for ~500 notable courses merged in. `pg_trgm` index. Can hit `/course/pebble-beach-golf-links` and see a page (no videos yet).

**M3 — YouTube ingestion working for 1 channel (1 evening).** Channel + video tables populated for one test channel. Captions fetched. No extraction yet.

**M4 — LLM extraction + matching (1 weekend).** Extraction prompt tuned, fuzzy matcher, review queue populated. Backfill the test channel end-to-end. Manually triage a sample to sanity-check quality.

**M5 — Search UI (1 weekend).** Working search, course pages, embedded YouTube player, filter by channel/date. This is the user-facing milestone.

**M6 — Backfill all 50 channels.** Run the pipeline at scale. Triage the queue.

**M7 — Polish + share.** OG tags, basic analytics (Plausible/Vercel), share on r/golf.

## Open questions to revisit

- **Job queue:** Inngest vs Trigger.dev. Decide at M3.
- **Captions failure rate:** what % of videos won't have auto-captions? Some big channels may have them disabled. Fallback path?
- **Multi-course videos:** "We Played 4 Courses in Scotland" — extraction should handle this cleanly, but UI needs to think about whether 1 video appearing on 4 course pages is OK (probably yes, with timestamp deep-links as a later enhancement).
- **Re-extraction:** when we improve the prompt, we want to re-run on existing videos. `extraction_model` field is the hook; need a job to find stale-model rows and re-process.
- **Channel discovery:** how do we expand beyond the seed 50? Manual for now; community suggestions later.

---

**Next step after you approve this plan:** M1 — scaffold the Next.js app, wire up Neon + Drizzle, deploy a hello-world to Vercel. I'll also walk you through creating the YouTube Data API key when we get to M3.
