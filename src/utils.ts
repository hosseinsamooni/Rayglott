import { environment } from "@raycast/api";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const PAUSE_FILE = path.join(os.homedir(), ".raycast_auto_abc_paused");
const BINARY_PATH = path.join(environment.supportPath, "raycast-abc-watcher");
const SWIFT_SOURCE = path.join(environment.assetsPath, "watcher.swift");

export class XcodeCLTMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XcodeCLTMissingError";
  }
}

export function preflightXcodeCLT(): void {
  try {
    execSync("xcode-select -p", { stdio: "ignore" });
  } catch {
    throw new XcodeCLTMissingError(
      "Xcode Command Line Tools not found. Run `xcode-select --install`.",
    );
  }
  try {
    execSync("which swiftc", { stdio: "ignore" });
  } catch {
    throw new XcodeCLTMissingError(
      "swiftc not found. Install Xcode Command Line Tools: `xcode-select --install`.",
    );
  }
}

export function ensureDaemonRunning(): void {
  if (!fs.existsSync(environment.supportPath)) {
    fs.mkdirSync(environment.supportPath, { recursive: true });
  }

  // پیش‌بررسی Xcode Command Line Tools / swiftc قبل از کامپایل
  if (!fs.existsSync(BINARY_PATH)) {
    preflightXcodeCLT();
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
