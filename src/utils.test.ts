import { describe, it, expect, vi, beforeEach } from "vitest";

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
  mockedSpawn.mockReturnValue({ unref: vi.fn() } as unknown as ReturnType<
    typeof spawn
  >);
  execSyncBehavior("running");
  mockedFs.readFileSync.mockReturnValue("{}");
});

describe("daemon.ensureDaemonRunning", () => {
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
});

describe("state.readState", () => {
  it("returns defaults when state file is missing", () => {
    existingPaths();
    const s = state.readState();
    expect(s.schemaVersion).toBe(1);
    expect(s.paused).toBe(false);
  });
});

describe("pause.toggleWatcher", () => {
  it("pauses when currently active and returns false", () => {
    existingPaths(SUPPORT, BINARY);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ schemaVersion: 1, paused: false }),
    );
    const result = pause.toggleWatcher();
    expect(result).toBe(false);
  });
});
