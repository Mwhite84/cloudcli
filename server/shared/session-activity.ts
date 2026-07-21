import fs from 'node:fs';

/**
 * Resume guard: a session whose on-disk transcript was written moments ago is
 * almost certainly owned by a live writer (an external CLI run, a foreman
 * loop, or a still-streaming cloudcli run). Claude/Codex transcripts are
 * single-writer append-only JSONL — spawning a second `--resume` against one
 * interrupts or corrupts the running process.
 *
 * The guard treats "transcript modified within the last N seconds" as live.
 * N defaults to 120 and can be tuned (or disabled with 0) via
 * CLOUDCLI_RESUME_GUARD_SECONDS.
 */
const DEFAULT_RESUME_GUARD_SECONDS = 120;

export function getResumeGuardSeconds(): number {
  const raw = Number(process.env.CLOUDCLI_RESUME_GUARD_SECONDS);
  if (Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return DEFAULT_RESUME_GUARD_SECONDS;
}

/**
 * Seconds since the session transcript file was last written, or null when
 * the path is unknown or unreadable (opencode sessions have no jsonl_path).
 */
export function getTranscriptIdleSeconds(jsonlPath: string | null | undefined): number | null {
  if (!jsonlPath) {
    return null;
  }

  try {
    const stat = fs.statSync(jsonlPath);
    return Math.max(0, (Date.now() - stat.mtimeMs) / 1000);
  } catch {
    return null;
  }
}

/**
 * True when the transcript looks live under the current guard window.
 * Returns false when the guard is disabled or the transcript is unknown.
 */
export function isTranscriptRecentlyActive(jsonlPath: string | null | undefined): boolean {
  const guardSeconds = getResumeGuardSeconds();
  if (guardSeconds === 0) {
    return false;
  }

  const idleSeconds = getTranscriptIdleSeconds(jsonlPath);
  return idleSeconds !== null && idleSeconds < guardSeconds;
}
