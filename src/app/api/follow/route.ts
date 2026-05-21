import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseSubscriptions, courses } from "@/db/schema";
import { sendConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string; courseSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const courseSlug = (body.courseSlug ?? "").trim();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  if (!courseSlug) {
    return NextResponse.json({ error: "missing courseSlug" }, { status: 400 });
  }

  // Resolve course
  const [course] = await db
    .select({ id: courses.id, name: courses.name, slug: courses.slug })
    .from(courses)
    .where(eq(courses.slug, courseSlug))
    .limit(1);
  if (!course) {
    return NextResponse.json({ error: "course not found" }, { status: 404 });
  }

  // Already subscribed?
  const [existing] = await db
    .select({ id: courseSubscriptions.id, confirmedAt: courseSubscriptions.confirmedAt })
    .from(courseSubscriptions)
    .where(
      and(
        eq(courseSubscriptions.email, email),
        eq(courseSubscriptions.courseId, course.id),
      ),
    )
    .limit(1);

  if (existing?.confirmedAt) {
    // Already confirmed — idempotent success
    return NextResponse.json({ status: "already_subscribed" });
  }

  // Create or refresh pending subscription
  const confirmationToken = randomBytes(24).toString("base64url");
  const unsubscribeToken = randomBytes(24).toString("base64url");

  if (existing) {
    // Refresh tokens for the pending row (user re-requested confirmation)
    await db
      .update(courseSubscriptions)
      .set({ confirmationToken, unsubscribeToken })
      .where(eq(courseSubscriptions.id, existing.id));
  } else {
    await db.insert(courseSubscriptions).values({
      email,
      courseId: course.id,
      confirmationToken,
      unsubscribeToken,
    });
  }

  try {
    await sendConfirmationEmail({
      to: email,
      courseName: course.name,
      courseSlug: course.slug,
      confirmationToken,
    });
  } catch (err) {
    console.error("confirmation email failed:", err);
    return NextResponse.json(
      { error: "failed to send confirmation email" },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "confirmation_sent" });
}
