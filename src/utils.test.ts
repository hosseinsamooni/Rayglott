import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import { execSync, spawn } from "child_process";
import { environment } from "@raycast/api";

vi.mock("@raycast/api", () => ({
  environment: {
    supportPath: "/tmp/rayglott-support",
    assetsPath: "/tmp/rayglott-assets",
  },
}));

vi.mock("fs");
vi.mock("child_process");

import * as daemon from "./daemon";
import * as state from "./state";
import * as pause from "./pause";

const SUPPORT = environment.supportPath;
const ASSETS = environment.assetsPath;
const BINARY = path.join(SUPPORT, "raycast-abc-watcher");
const SWIFT_SRC = path.join(ASSETS, "watcher.swift");
const STATE_DIR = path.join(os.homedir(), ".rayglott");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const LEGACY_PAUSE_FILE = path.join(os.homedir(), ".raycast_auto_abc_paused");

const mockedFs = vi.mocked(fs);
const mockedExecSync = vi.mocked(execSync);
const mockedSpawn = vi.mocked(spawn);

function existingPaths(...paths: string[]): void {
  const set = new Set(paths);
  mockedFs.existsSync.mockImplementation((p: unknown) => set.has(String(p)));
}

function execSyncBehavior(mode: "running" | "not-running"): void {
  mockedExecSync.mockImplementation((cmd: unknown) => {
    if (String(cmd).includes("pgrep")) {
      if (mode === "not-running") {
        throw new Error("no process");
      }
      return Buffer.from("");
    }
    return Buffer.from("");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFs.existsSync.mockReturnValue(false);
  mockedFs.readFileSync.mockReturnValue("{}");
  mockedSpawn.mockReturnValue({ unref: vi.fn() } as unknown as ReturnType<
    typeof spawn
  >);
  execSyncBehavior("running");
});

describe("daemon", () => {
  it("creates the support directory when it is missing", () => {
    existingPaths(BINARY);
    daemon.ensureDaemonRunning();
    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(SUPPORT, {
      recursive: true,
    });
  });

  it("compiles the Swift source when the binary is missing", () => {
    existingPaths(SUPPORT);
    daemon.ensureDaemonRunning();
    expect(mockedExecSync).toHaveBeenCalledWith(
      `swiftc -O "${SWIFT_SRC}" -o "${BINARY}"`,
    );
  });

  it("spawns a detached daemon when none is running", () => {
    existingPaths(SUPPORT, BINARY);
    execSyncBehavior("not-running");
    daemon.ensureDaemonRunning();
    expect(mockedSpawn).toHaveBeenCalledWith(BINARY, [], {
      detached: true,
      stdio: "ignore",
    });
  });

  it("does not spawn when a daemon is already running", () => {
    existingPaths(SUPPORT, BINARY);
    execSyncBehavior("running");
    daemon.ensureDaemonRunning();
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("throws XcodeCLTMissingError when xcode-select is missing", () => {
    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd).includes("xcode-select")) {
        throw new Error("missing");
      }
      return Buffer.from("");
    });
    expect(() => daemon.preflightXcodeCLT()).toThrow(
      daemon.XcodeCLTMissingError,
    );
  });

  it("reports daemon running state from pgrep", () => {
    execSyncBehavior("running");
    expect(daemon.isDaemonRunning()).toBe(true);
    execSyncBehavior("not-running");
    expect(daemon.isDaemonRunning()).toBe(false);
  });
});

describe("state", () => {
  it("returns defaults when the state file is missing", () => {
    existingPaths();
    const s = state.readState();
    expect(s.schemaVersion).toBe(1);
    expect(s.paused).toBe(false);
  });

  it("reads paused from an existing state file", () => {
    existingPaths(STATE_FILE);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: 1, paused: true }),
    );
    const s = state.readState();
    expect(s.paused).toBe(true);
  });

  it("recovers a corrupt state file", () => {
    existingPaths(STATE_FILE);
    mockedFs.readFileSync.mockReturnValue("{bad");
    const s = state.readState();
    expect(s.paused).toBe(false);
    expect(s.lastError).toBe("State file recovered after corruption.");
  });

  it("recovers a schema mismatch preserving paused", () => {
    existingPaths(STATE_FILE);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: 99, paused: true }),
    );
    const s = state.readState();
    expect(s.paused).toBe(true);
    expect(s.lastError).toBe("State file recovered after schema mismatch.");
  });

  it("migrates the legacy pause marker", () => {
    existingPaths(LEGACY_PAUSE_FILE);
    const s = state.readState();
    expect(s.paused).toBe(true);
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(LEGACY_PAUSE_FILE);
  });

  it("writes state atomically", () => {
    existingPaths();
    state.setPaused(true);
    expect(mockedFs.renameSync).toHaveBeenCalledWith(
      `${STATE_FILE}.tmp`,
      STATE_FILE,
    );
  });
});

describe("pause", () => {
  it("reflects paused state", () => {
    existingPaths(STATE_FILE);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: 1, paused: true }),
    );
    expect(pause.isWatcherPaused()).toBe(true);
  });

  it("ensures the daemon is running before mutating state", () => {
    existingPaths(SUPPORT, BINARY, STATE_FILE);
    execSyncBehavior("not-running");
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: 1, paused: false }),
    );
    pause.setWatcherPaused(true);
    expect(mockedSpawn).toHaveBeenCalled();
  });

  it("pauses when currently active and returns false", () => {
    existingPaths(SUPPORT, BINARY, STATE_FILE);
    execSyncBehavior("running");
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: 1, paused: false }),
    );
    const result = pause.toggleWatcher();
    expect(result).toBe(false);
  });

  it("resumes when currently paused and returns true", () => {
    existingPaths(SUPPORT, BINARY, STATE_FILE);
    execSyncBehavior("running");
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: 1, paused: true }),
    );
    const result = pause.toggleWatcher();
    expect(result).toBe(true);
  });
});
