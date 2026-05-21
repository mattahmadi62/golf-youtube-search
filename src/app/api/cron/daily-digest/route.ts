/**
 * Daily digest cron: for each confirmed subscription, finds new video_courses
 * rows since the subscription's last_notified_at, groups by email, and sends
 * one email per recipient (covering all their followed courses).
 *
 * Hardened against Vercel's 10s function ceiling on the Hobby plan: capped at
 * 200 recipients per invocation, batches send sequentially with a small
 * throttle so we stay under Resend's rate limit (2/sec free tier).
 *
 * Uses the raw Neon driver for queries (the same pattern as scripts/) instead
 * of Drizzle — Drizzle's sql template doesn't cleanly handle PG array
 * parameterization for `ANY(${arr}::uuid[])`.
 *
 * Authorized via CRON_SECRET header.
 */
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sendDigestEmail, SITE_URL } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // ignored on Hobby (10s cap)

const MAX_RECIPIENTS_PER_RUN = 200;
const PER_SEND_DELAY_MS = 550; // ~1.8/sec, under Resend free tier 2/sec
const MAX_VIDEOS_PER_COURSE = 5;

type SubRow = {
  id: string;
  email: string;
  course_id: string;
  last_notified_at: Date | string;
  unsubscribe_token: string;
};

type MatchRow = {
  course_id: string;
  link_created_at: Date | string;
  yt_video_id: string;
  title: string;
  published_at: Date | string | null;
  channel_name: string | null;
  course_name: string;
  course_slug: string;
  course_state: string | null;
};

export async function GET(request: Request) {
  // Auth
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }
  const sql = neon(databaseUrl);

  try {
    const subs = (await sql`
      SELECT id, email, course_id, last_notified_at, unsubscribe_token
      FROM course_subscriptions
      WHERE confirmed_at IS NOT NULL
      ORDER BY email ASC
    `) as SubRow[];

    if (subs.length === 0) {
      return NextResponse.json({
        status: "no_subscribers",
        recipients: 0,
        sent: 0,
      });
    }

    // Group by email
    const byEmail = new Map<string, SubRow[]>();
    for (const s of subs) {
      const arr = byEmail.get(s.email) ?? [];
      arr.push(s);
      byEmail.set(s.email, arr);
    }

    const emails = Array.from(byEmail.keys()).slice(0, MAX_RECIPIENTS_PER_RUN);
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const email of emails) {
      const userSubs = byEmail.get(email)!;
      const courseIds = userSubs.map((s) => s.course_id);

      let newMatches: MatchRow[];
      try {
        newMatches = (await sql`
          SELECT
            vc.course_id        AS course_id,
            vc.created_at       AS link_created_at,
            v.yt_video_id       AS yt_video_id,
            v.title             AS title,
            v.published_at      AS published_at,
            ch.name             AS channel_name,
            c.name              AS course_name,
            c.slug              AS course_slug,
            c.state             AS course_state
          FROM video_courses vc
          JOIN videos v ON v.id = vc.video_id
          LEFT JOIN channels ch ON ch.id = v.channel_id
          JOIN courses c ON c.id = vc.course_id
          WHERE vc.course_id = ANY(${courseIds}::uuid[])
            AND vc.created_at > (
              SELECT last_notified_at FROM course_subscriptions
              WHERE email = ${email} AND course_id = vc.course_id
            )
          ORDER BY vc.course_id, vc.created_at DESC
        `) as MatchRow[];
      } catch (err) {
        errors.push(`${email} query: ${(err as Error).message}`);
        continue;
      }

      if (newMatches.length === 0) {
        skipped++;
        continue;
      }

      // Group by course, cap videos per course
      const groupsMap = new Map<
        string,
        {
          courseName: string;
          courseSlug: string;
          courseState: string | null;
          unsubscribeUrl: string;
          videos: Array<{
            title: string;
            ytVideoId: string;
            channelName: string | null;
            publishedAt: Date | null;
          }>;
        }
      >();
      for (const row of newMatches) {
        const existing = groupsMap.get(row.course_id);
        if (existing && existing.videos.length >= MAX_VIDEOS_PER_COURSE) continue;
        const sub = userSubs.find((s) => s.course_id === row.course_id);
        const unsubscribeUrl = `${SITE_URL}/api/follow/unsubscribe?token=${encodeURIComponent(sub?.unsubscribe_token ?? "")}`;
        const publishedAt = row.published_at ? new Date(row.published_at) : null;
        if (!existing) {
          groupsMap.set(row.course_id, {
            courseName: row.course_name,
            courseSlug: row.course_slug,
            courseState: row.course_state,
            unsubscribeUrl,
            videos: [
              {
                title: row.title,
                ytVideoId: row.yt_video_id,
                channelName: row.channel_name,
                publishedAt,
              },
            ],
          });
        } else {
          existing.videos.push({
            title: row.title,
            ytVideoId: row.yt_video_id,
            channelName: row.channel_name,
            publishedAt,
          });
        }
      }
      const groups = Array.from(groupsMap.values());
      const unsubscribeAllUrl = groups[0]?.unsubscribeUrl ?? "#";

      try {
        await sendDigestEmail({ to: email, unsubscribeAllUrl, groups });
        sent++;
        const notifiedCourseIds = Array.from(groupsMap.keys());
        await sql`
          UPDATE course_subscriptions
          SET last_notified_at = NOW()
          WHERE email = ${email} AND course_id = ANY(${notifiedCourseIds}::uuid[])
        `;
      } catch (err) {
        errors.push(`${email} send: ${(err as Error).message}`);
      }

      if (sent < emails.length) {
        await new Promise((r) => setTimeout(r, PER_SEND_DELAY_MS));
      }
    }

    return NextResponse.json({
      status: "ok",
      recipients: emails.length,
      sent,
      skipped_no_new: skipped,
      errors: errors.slice(0, 10),
      truncated: subs.length > MAX_RECIPIENTS_PER_RUN ? "yes_more_pending" : "no",
    });
  } catch (err) {
    // Surface the actual error in the response so we can debug from a curl
    return NextResponse.json(
      { error: "cron_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
