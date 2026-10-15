import { environment } from "@raycast/api";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const PAUSE_FILE = path.join(os.homedir(), ".raycast_auto_abc_paused");
const BINARY_PATH = path.join(environment.supportPath, "raycast-abc-watcher");
const SWIFT_SOURCE = path.join(environment.assetsPath, "watcher.swift");

export function ensureDaemonRunning(): void {
  if (!fs.existsSync(environment.supportPath)) {
    fs.mkdirSync(environment.supportPath, { recursive: true });
  }

  // کامپایل فایل Swift در اولین اجرا
  if (!fs.existsSync(BINARY_PATH)) {
    execSync(`swiftc -O "${SWIFT_SOURCE}" -o "${BINARY_PATH}"`);
  }

  // بررسی اینکه آیا دیمن در حال اجراست یا نه
  try {
    execSync(`pgrep -f "${BINARY_PATH}"`);
  } catch {
    // اگر در حال اجرا نبود، در پس‌زمینه استارتش بزن
    const child = spawn(BINARY_PATH, [], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
}

export function isWatcherPaused(): boolean {
  return fs.existsSync(PAUSE_FILE);
}

export function setWatcherPaused(paused: boolean): void {
  ensureDaemonRunning();
  if (paused) {
    fs.writeFileSync(PAUSE_FILE, "paused");
  } else if (fs.existsSync(PAUSE_FILE)) {
    fs.unlinkSync(PAUSE_FILE);
  }
}

export function toggleWatcher(): boolean {
  const nextState = !isWatcherPaused();
  setWatcherPaused(nextState);
  return !nextState; // true = Active, false = Paused
}