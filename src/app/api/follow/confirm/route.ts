import { NextResponse } from "next/server";
import { eq, isNull } from "drizzle-orm";
import { and } from "drizzle-orm";
import { db } from "@/db";
import { courseSubscriptions, courses } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get("token") ?? "").trim();
  if (!token) return htmlResponse(400, "Bad request", "Missing confirmation token.");

  const [row] = await db
    .select({
      id: courseSubscriptions.id,
      confirmedAt: courseSubscriptions.confirmedAt,
      courseId: courseSubscriptions.courseId,
      unsubscribeToken: courseSubscriptions.unsubscribeToken,
    })
    .from(courseSubscriptions)
    .where(eq(courseSubscriptions.confirmationToken, token))
    .limit(1);

  if (!row) {
    return htmlResponse(
      404,
      "Invalid or expired link",
      "This confirmation link is no longer valid. If you still want to follow the course, head back to the course page and resubmit the form.",
    );
  }

  // If already confirmed, treat as idempotent success
  if (!row.confirmedAt) {
    await db
      .update(courseSubscriptions)
      .set({ confirmedAt: new Date() })
      .where(eq(courseSubscriptions.id, row.id));
  }

  // Look up course for the success page
  const [course] = await db
    .select({ name: courses.name, slug: courses.slug })
    .from(courses)
    .where(eq(courses.id, row.courseId))
    .limit(1);

  const siteUrl = process.env.SITE_URL ?? "https://caddiereel.com";
  const courseUrl = `${siteUrl}/course/${course?.slug ?? ""}`;
  const unsubUrl = `${siteUrl}/api/follow/unsubscribe?token=${encodeURIComponent(row.unsubscribeToken)}`;

  return htmlResponse(
    200,
    "You're following " + (course?.name ?? "this course"),
    `<p>You'll get one email a day when we index a new video at <strong>${escapeHtml(course?.name ?? "this course")}</strong>. Nothing more.</p>
     <p style="margin-top:24px;"><a href="${courseUrl}" style="display:inline-block;background:#1F4D32;color:#F4F1EA;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:500;">Back to ${escapeHtml(course?.name ?? "the course")}</a></p>
     <p style="margin-top:24px;font-size:12px;color:#3A3A33;">Change your mind? <a href="${unsubUrl}" style="color:#3A3A33;">Unfollow.</a></p>`,
  );
}

function htmlResponse(status: number, heading: string, body: string) {
  const html = `<!doctype html>
<html><head><title>CaddieReel</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F4F1EA;color:#1F2A20;margin:0;padding:48px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;padding:32px;border:1px solid #1F4D3226;border-radius:12px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#1F4D32;">CaddieReel</p>
    <h1 style="margin:8px 0 16px;font-size:22px;">${escapeHtml(heading)}</h1>
    ${body}
  </div>
</body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
