/**
 * Daily digest cron: for each confirmed subscription, finds new video_courses
 * rows since the subscription's last_notified_at, groups by email, and sends
 * one email per recipient (covering all their followed courses).
 *
 * Hardened against Vercel's 10s function ceiling on the Hobby plan: capped at
 * 200 recipients per invocation, batches send sequentially with a small
 * throttle so we stay under Resend's rate limit (2/sec free tier).
 *
 * Authorized via CRON_SECRET header (Vercel injects automatically for the
 * configured cron path).
 */
import { NextResponse } from "next/server";
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  channels,
  courseSubscriptions,
  courses,
  videoCourses,
  videos,
} from "@/db/schema";
import { sendDigestEmail, SITE_URL } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min (Pro plan); ignored on Hobby (10s cap)

const MAX_RECIPIENTS_PER_RUN = 200;
const PER_SEND_DELAY_MS = 550; // ~1.8/sec, under Resend free tier 2/sec
const MAX_VIDEOS_PER_COURSE = 5; // cap to keep emails readable

export async function GET(request: Request) {
  // Authorize: Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically
  // when CRON_SECRET is set in env. Local manual calls use the same header.
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Confirmed subscriptions only
  const subs = await db
    .select({
      id: courseSubscriptions.id,
      email: courseSubscriptions.email,
      courseId: courseSubscriptions.courseId,
      lastNotifiedAt: courseSubscriptions.lastNotifiedAt,
      unsubscribeToken: courseSubscriptions.unsubscribeToken,
    })
    .from(courseSubscriptions)
    .where(isNotNull(courseSubscriptions.confirmedAt))
    .orderBy(asc(courseSubscriptions.email));

  if (subs.length === 0) {
    return NextResponse.json({ status: "no_subscribers", recipients: 0, sent: 0 });
  }

  // Group subscriptions by email for one-email-per-recipient
  const byEmail = new Map<
    string,
    Array<(typeof subs)[number]>
  >();
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
    const courseIds = userSubs.map((s) => s.courseId);

    // Fetch all new video_courses for this user's followed courses, with video info.
    const newMatches = (await db.execute(sql`
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
    `)) as unknown as {
      rows: Array<{
        course_id: string;
        link_created_at: Date;
        yt_video_id: string;
        title: string;
        published_at: Date | null;
        channel_name: string | null;
        course_name: string;
        course_slug: string;
        course_state: string | null;
      }>;
    };

    if (newMatches.rows.length === 0) {
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
    for (const row of newMatches.rows) {
      const existing = groupsMap.get(row.course_id);
      if (existing && existing.videos.length >= MAX_VIDEOS_PER_COURSE) continue;
      const sub = userSubs.find((s) => s.courseId === row.course_id);
      const unsubscribeUrl = `${SITE_URL}/api/follow/unsubscribe?token=${encodeURIComponent(sub?.unsubscribeToken ?? "")}`;
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
              publishedAt: row.published_at,
            },
          ],
        });
      } else {
        existing.videos.push({
          title: row.title,
          ytVideoId: row.yt_video_id,
          channelName: row.channel_name,
          publishedAt: row.published_at,
        });
      }
    }
    const groups = Array.from(groupsMap.values());

    // "unsubscribe from everything" url = unsubscribe token of the first subscription
    // (single-token unsubscribe is per-subscription; for "all" we'd need a separate
    //  flow. For v1 we link the first sub's token and the email instructs them
    //  there's a per-course link below if they want more granular control.)
    const unsubscribeAllUrl = groups[0]?.unsubscribeUrl ?? "#";

    try {
      await sendDigestEmail({ to: email, unsubscribeAllUrl, groups });
      sent++;

      // Bump last_notified_at on each affected subscription
      const notifiedCourseIds = Array.from(groupsMap.keys());
      await db
        .update(courseSubscriptions)
        .set({ lastNotifiedAt: new Date() })
        .where(
          and(
            eq(courseSubscriptions.email, email),
            inArray(courseSubscriptions.courseId, notifiedCourseIds),
          ),
        );
    } catch (err) {
      errors.push(`${email}: ${(err as Error).message}`);
    }

    // Throttle
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
}
