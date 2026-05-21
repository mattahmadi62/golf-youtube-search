/**
 * Resend client + email senders for subscription flow.
 *
 * Subjects + bodies are intentionally minimal — Yardage Book aesthetic in
 * inbox doesn't translate well, so we keep things readable plaintext-style
 * with subtle HTML structure.
 */
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.warn("RESEND_API_KEY is not set — email sending will fail");
}

export const resend = new Resend(RESEND_API_KEY ?? "");

export const FROM_EMAIL = "CaddieReel <alerts@caddiereel.com>";
export const SITE_URL = process.env.SITE_URL ?? "https://caddiereel.com";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

async function send(args: SendArgs) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const r = await resend.emails.send({
    from: FROM_EMAIL,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (r.error) throw new Error(`Resend error: ${r.error.message}`);
  return r.data;
}

/** Confirmation email: sent immediately when a user submits the Follow form. */
export async function sendConfirmationEmail(params: {
  to: string;
  courseName: string;
  courseSlug: string;
  confirmationToken: string;
}) {
  const confirmUrl = `${SITE_URL}/api/follow/confirm?token=${encodeURIComponent(params.confirmationToken)}`;
  const subject = `Confirm your CaddieReel follow on ${params.courseName}`;
  const text = [
    `You asked to follow ${params.courseName} on CaddieReel.`,
    "",
    `Confirm: ${confirmUrl}`,
    "",
    "You'll get one email a day when new videos are added at courses you follow. Nothing more.",
    "",
    "If you didn't request this, just ignore this email — nothing happens until you confirm.",
  ].join("\n");
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F4F1EA;color:#1F2A20;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border:1px solid #1F4D3226;border-radius:12px;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#1F4D32;">CaddieReel</p>
    <h1 style="margin:8px 0 16px;font-size:22px;color:#1F2A20;">Confirm your follow</h1>
    <p style="margin:0 0 16px;">You asked to follow <strong>${escapeHtml(params.courseName)}</strong>. Click the button below to confirm — once a day, if we index a new video filmed there, you'll get an email.</p>
    <p style="margin:24px 0;"><a href="${confirmUrl}" style="display:inline-block;background:#1F4D32;color:#F4F1EA;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:500;">Confirm follow</a></p>
    <p style="margin:24px 0 0;font-size:13px;color:#3A3A33;">Didn't request this? Just ignore — nothing happens until you confirm.</p>
  </div>
</body></html>`;
  return send({ to: params.to, subject, html, text });
}

/** Daily digest email: sent by the cron when there are new matches. */
export async function sendDigestEmail(params: {
  to: string;
  unsubscribeAllUrl: string;
  groups: Array<{
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
  }>;
}) {
  const totalVideos = params.groups.reduce((acc, g) => acc + g.videos.length, 0);
  const courseLabel = params.groups.length === 1 ? params.groups[0].courseName : `${params.groups.length} courses you follow`;
  const subject =
    totalVideos === 1
      ? `New video at ${params.groups[0].courseName}`
      : `${totalVideos} new videos at ${courseLabel}`;

  // Plain text
  const textBlocks = params.groups.map((g) => {
    const header = `${g.courseName}${g.courseState ? `, ${g.courseState}` : ""}`;
    const lines = g.videos.map(
      (v) => `  • ${v.channelName ?? "?"}: ${v.title}\n    https://www.youtube.com/watch?v=${v.ytVideoId}`,
    );
    return `${header}\n  → ${SITE_URL}/course/${g.courseSlug}\n${lines.join("\n")}\n  unfollow this course: ${g.unsubscribeUrl}`;
  });
  const text =
    `New on CaddieReel at courses you follow:\n\n${textBlocks.join("\n\n")}\n\nUnfollow all: ${params.unsubscribeAllUrl}\n`;

  // HTML
  const groupsHtml = params.groups
    .map((g) => {
      const videosHtml = g.videos
        .map(
          (v) => `
        <li style="margin:8px 0;">
          <a href="https://www.youtube.com/watch?v=${v.ytVideoId}" style="color:#1F2A20;text-decoration:none;">
            <strong>${escapeHtml(v.title)}</strong>
          </a><br>
          <span style="font-size:12px;color:#3A3A33;">${escapeHtml(v.channelName ?? "—")}${v.publishedAt ? ` · ${new Date(v.publishedAt).toLocaleDateString()}` : ""}</span>
        </li>`,
        )
        .join("");
      return `
      <div style="margin:24px 0;padding:16px;border:1px solid #1F4D3226;border-radius:8px;background:#fff;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#1F4D32;">${escapeHtml(g.courseState ?? "")}</p>
        <h2 style="margin:0 0 4px;font-size:18px;"><a href="${SITE_URL}/course/${g.courseSlug}" style="color:#1F2A20;text-decoration:none;">${escapeHtml(g.courseName)} →</a></h2>
        <ul style="margin:12px 0 0;padding:0;list-style:none;">${videosHtml}</ul>
        <p style="margin:16px 0 0;font-size:11px;color:#3A3A33;"><a href="${g.unsubscribeUrl}" style="color:#3A3A33;">unfollow this course</a></p>
      </div>`;
    })
    .join("");

  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F4F1EA;color:#1F2A20;margin:0;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#1F4D32;">CaddieReel</p>
    <h1 style="margin:8px 0 16px;font-size:22px;">${totalVideos === 1 ? "1 new video at a course you follow" : `${totalVideos} new videos at courses you follow`}</h1>
    ${groupsHtml}
    <p style="margin:32px 0 0;font-size:12px;color:#3A3A33;text-align:center;">
      <a href="${params.unsubscribeAllUrl}" style="color:#3A3A33;">unsubscribe from everything</a>
    </p>
  </div>
</body></html>`;

  return send({ to: params.to, subject, html, text });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
