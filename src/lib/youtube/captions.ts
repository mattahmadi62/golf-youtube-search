import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Outcome of a single video's caption fetch.
 *
 * - text === non-empty string: auto-captions were available and parsed.
 * - text === "":                yt-dlp ran cleanly but the video has no
 *                               auto-captions (private, music, region-locked,
 *                               captions disabled by uploader, etc.).
 * - text === null:              yt-dlp itself failed (network, age gate,
 *                               video removed). Caller should leave the row
 *                               as "not attempted" and retry later.
 */
export type CaptionResult = {
  text: string | null;
  errorReason?: string;
};

type Json3 = {
  events?: Array<{
    segs?: Array<{ utf8?: string }>;
  }>;
};

function parseJson3(raw: string): string {
  let data: Json3;
  try {
    data = JSON.parse(raw);
  } catch {
    return "";
  }
  const parts: string[] = [];
  for (const ev of data.events ?? []) {
    for (const seg of ev.segs ?? []) {
      if (typeof seg.utf8 === "string") parts.push(seg.utf8);
    }
  }
  // Auto-captions repeat words across overlapping cues for word-level
  // highlighting; collapse runs of whitespace and drop the ASR newline tokens.
  return parts
    .join("")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function runYtDlp(
  videoId: string,
  workDir: string,
  timeoutMs: number,
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const args = [
      "--write-auto-subs",
      "--skip-download",
      "--sub-format",
      "json3",
      "--sub-langs",
      "en.*",
      "--quiet",
      "--no-warnings",
      "--socket-timeout",
      "30",
      "-o",
      "%(id)s",
      "-P",
      workDir,
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const killer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(killer);
      resolve({ ok: code === 0, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(killer);
      resolve({ ok: false, stderr: String(err) });
    });
  });
}

async function findCaptionFile(workDir: string, videoId: string): Promise<string | null> {
  // yt-dlp writes files like {videoId}.{lang}.json3 — language can be "en",
  // "en-US", "en-orig", etc. depending on the video.
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(workDir);
  const match = entries.find(
    (f) => f.startsWith(`${videoId}.`) && f.endsWith(".json3"),
  );
  return match ? path.join(workDir, match) : null;
}

/**
 * Fetch auto-captions for a single video via yt-dlp. Caller is responsible
 * for concurrency control; this function is one-shot.
 */
export async function fetchCaptions(
  videoId: string,
  opts: { timeoutMs?: number } = {},
): Promise<CaptionResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const workDir = await mkdtemp(path.join(tmpdir(), `yt-${videoId}-`));
  try {
    const { ok, stderr } = await runYtDlp(videoId, workDir, timeoutMs);
    if (!ok) {
      return { text: null, errorReason: stderr.split("\n")[0]?.slice(0, 200) || "yt-dlp failed" };
    }
    const file = await findCaptionFile(workDir, videoId);
    if (!file) {
      // yt-dlp exit 0 + no file = no auto-captions for this video.
      return { text: "" };
    }
    const raw = await readFile(file, "utf8");
    return { text: parseJson3(raw) };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function ytDlpAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", ["--version"], { stdio: "ignore" });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
