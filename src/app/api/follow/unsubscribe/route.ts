import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courseSubscriptions, courses } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get("token") ?? "").trim();
  if (!token) return htmlResponse(400, "Bad request", "Missing unsubscribe token.");

  const [row] = await db
    .select({
      id: courseSubscriptions.id,
      courseId: courseSubscriptions.courseId,
    })
    .from(courseSubscriptions)
    .where(eq(courseSubscriptions.unsubscribeToken, token))
    .limit(1);

  if (!row) {
    // Idempotent: don't reveal whether the token matched
    return htmlResponse(
      200,
      "Unsubscribed",
      "You'll no longer receive emails from this subscription.",
    );
  }

  const [course] = await db
    .select({ name: courses.name })
    .from(courses)
    .where(eq(courses.id, row.courseId))
    .limit(1);

  await db.delete(courseSubscriptions).where(eq(courseSubscriptions.id, row.id));

  return htmlResponse(
    200,
    "Unfollowed " + (course?.name ?? "course"),
    `<p>You won't get any more emails about <strong>${escapeHtml(course?.name ?? "this course")}</strong>.</p>
     <p style="margin-top:24px;font-size:12px;color:#3A3A33;">Made by mistake? Just head back to the course page and follow again.</p>`,
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
