import fs from "fs";
import path from "path";
import os from "os";

export const STATE_DIR = path.join(os.homedir(), ".rayglott");
export const STATE_FILE = path.join(STATE_DIR, "state.json");
export const LEGACY_PAUSE_FILE = path.join(
  os.homedir(),
  ".raycast_auto_abc_paused",
);

export interface RayglottState {
  schemaVersion: number;
  paused: boolean;
  daemonPid: number | null;
  daemonStartedAt: string | null;
  lastTransitionAt: string | null;
  lastError: string | null;
  permission: { screenRecording: boolean; accessibility: boolean };
}

export const SCHEMA_VERSION = 1;

export function defaultState(): RayglottState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    daemonPid: null,
    daemonStartedAt: null,
    lastTransitionAt: null,
    lastError: null,
    permission: { screenRecording: false, accessibility: false },
  };
}

export function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readState(): RayglottState {
  ensureStateDir();

  // One-time migration: legacy marker file means "paused".
  let legacyPaused = false;
  if (fs.existsSync(LEGACY_PAUSE_FILE)) {
    legacyPaused = true;
    try {
      fs.unlinkSync(LEGACY_PAUSE_FILE);
    } catch {
      // ignore
    }
  }

  if (!fs.existsSync(STATE_FILE)) {
    const state = defaultState();
    if (legacyPaused) state.paused = true;
    return state;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    // Crash recovery: preserve paused if it can be read.
    let paused = legacyPaused;
    try {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      const p = JSON.parse(raw);
      if (isPlainObject(p) && typeof p.paused === "boolean") {
        paused = p.paused || legacyPaused;
      }
    } catch {
      // ignore
    }
    const recovered = defaultState();
    recovered.paused = paused;
    recovered.lastError = "State file recovered after corruption.";
    try {
      writeState(recovered);
    } catch {
      // ignore
    }
    return recovered;
  }

  if (!isPlainObject(parsed) || parsed.schemaVersion !== SCHEMA_VERSION) {
    // Unknown schema: recreate with defaults, preserving paused if readable.
    let paused = legacyPaused;
    if (isPlainObject(parsed) && typeof parsed.paused === "boolean") {
      paused = parsed.paused || legacyPaused;
    }
    const recovered = defaultState();
    recovered.paused = paused;
    recovered.lastError = "State file recovered after schema mismatch.";
    try {
      writeState(recovered);
    } catch {
      // ignore
    }
    return recovered;
  }

  const state: RayglottState = {
    ...defaultState(),
    ...(parsed as Partial<RayglottState>),
    permission: {
      ...defaultState().permission,
      ...(isPlainObject(parsed.permission)
        ? (parsed.permission as Partial<RayglottState["permission"]>)
        : {}),
    },
  };
  if (legacyPaused) state.paused = true;
  return state;
}

export function writeState(state: RayglottState): void {
  ensureStateDir();
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

export function isPaused(): boolean {
  return readState().paused;
}

export function setPaused(paused: boolean): void {
  const state = readState();
  state.paused = paused;
  writeState(state);
}
