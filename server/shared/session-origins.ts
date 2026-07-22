import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Session-origin registry: an append-only JSONL sidecar written by launch
 * wrappers (e.g. `claudex` tags the sessions it boots with origin "mc") so
 * the UI can badge WHO started an external session, which the transcript
 * itself never records. One JSON object per line: {"sessionId", "origin"}.
 */
const REGISTRY_PATH = path.join(os.homedir(), '.cloudcli', 'session-origins.jsonl');

export type SessionOriginEntry = {
  origin: string;
  // Name of the tmux session hosting the process, when the launch wrapper ran
  // inside tmux — lets the UI offer a safe attach to the live process.
  tmux: string | null;
};

let cachedMtimeMs = -1;
let cachedOrigins = new Map<string, SessionOriginEntry>();

function loadRegistry(): Map<string, SessionOriginEntry> {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(REGISTRY_PATH).mtimeMs;
  } catch {
    cachedMtimeMs = -1;
    cachedOrigins = new Map();
    return cachedOrigins;
  }

  if (mtimeMs === cachedMtimeMs) {
    return cachedOrigins;
  }

  const origins = new Map<string, SessionOriginEntry>();
  try {
    const lines = fs.readFileSync(REGISTRY_PATH, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { sessionId?: unknown; origin?: unknown; tmux?: unknown };
        if (typeof entry.sessionId === 'string' && typeof entry.origin === 'string') {
          origins.set(entry.sessionId, {
            origin: entry.origin,
            tmux: typeof entry.tmux === 'string' && entry.tmux ? entry.tmux : null,
          });
        }
      } catch {
        // A torn/corrupt line never poisons the rest of the registry.
      }
    }
  } catch {
    return cachedOrigins;
  }

  cachedMtimeMs = mtimeMs;
  cachedOrigins = origins;
  return cachedOrigins;
}

/**
 * Full registry entry for a provider-native session id, or null when the
 * session was never registered.
 */
export function getSessionOriginEntry(
  providerSessionId: string | null | undefined,
): SessionOriginEntry | null {
  if (!providerSessionId) {
    return null;
  }
  return loadRegistry().get(providerSessionId) ?? null;
}

/**
 * Origin tag for a provider-native session id ("mc" for claudex-launched
 * sessions), or null when the session was never registered.
 */
export function getSessionOrigin(providerSessionId: string | null | undefined): string | null {
  return getSessionOriginEntry(providerSessionId)?.origin ?? null;
}
