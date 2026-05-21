"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "ok_sent" | "ok_already" | "error";

const SANS = { fontFamily: "var(--font-geist-sans)" } as const;

export function FollowCourse({ courseSlug, courseName }: { courseSlug: string; courseName: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const r = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), courseSlug }),
      });
      const data = await r.json();
      if (!r.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong");
        return;
      }
      if (data.status === "already_subscribed") {
        setStatus("ok_already");
      } else {
        setStatus("ok_sent");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error — please try again");
    }
  }

  if (status === "ok_sent") {
    return (
      <div
        className="rounded-xl border border-[#1F4D32]/15 bg-white/70 px-5 py-4"
        style={SANS}
      >
        <p className="text-sm text-[#1F2A20]">
          📬 Check your inbox — sent a confirmation link to <strong>{email}</strong>.
        </p>
        <p className="mt-1 text-xs text-[#3A3A33]">
          You're not subscribed until you click it. (Look in spam if you don't see it.)
        </p>
      </div>
    );
  }

  if (status === "ok_already") {
    return (
      <div
        className="rounded-xl border border-[#1F4D32]/15 bg-white/70 px-5 py-4"
        style={SANS}
      >
        <p className="text-sm text-[#1F2A20]">
          ✓ You&apos;re already following {courseName}. We&apos;ll email when there&apos;s news.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-[#1F4D32]/15 bg-white/70 p-5"
      style={SANS}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#1F4D32]">
        Follow this course
      </p>
      <p className="mt-2 text-sm text-[#1F2A20]">
        Email me when a new video drops here. One daily digest, no spam.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className="flex-1 rounded-md border border-[#1F4D32]/25 bg-white px-3 py-2 text-sm text-[#1F2A20] placeholder:text-[#3A3A33]/60 focus:border-[#1F4D32] focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-md bg-[#1F4D32] px-4 py-2 text-sm font-medium text-[#F4F1EA] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "submitting" ? "Sending…" : "Follow"}
        </button>
      </div>
      {status === "error" && errorMsg && (
        <p className="mt-2 text-xs text-red-700">⚠ {errorMsg}</p>
      )}
    </form>
  );
}
