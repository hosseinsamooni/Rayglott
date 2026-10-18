import { environment } from "@raycast/api";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export const BINARY_PATH = path.join(
  environment.supportPath,
  "raycast-abc-watcher",
);
export const SWIFT_SOURCE = path.join(environment.assetsPath, "watcher.swift");
export const DAEMON_LOG = path.join(os.homedir(), ".rayglott", "daemon.log");

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

export function isDaemonRunning(): boolean {
  try {
    execSync(`pgrep -f "${BINARY_PATH}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function ensureDaemonRunning(): void {
  if (!fs.existsSync(environment.supportPath)) {
    fs.mkdirSync(environment.supportPath, { recursive: true });
  }

  // کامپایل فایل Swift در اولین اجرا
  if (!fs.existsSync(BINARY_PATH)) {
    preflightXcodeCLT();
    execSync(`swiftc -O "${SWIFT_SOURCE}" -o "${BINARY_PATH}"`);
  }

  // بررسی اینکه آیا دیمن در حال اجراست یا نه
  if (!isDaemonRunning()) {
    const child = spawn(BINARY_PATH, [], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
}

export function restartDaemon(): void {
  try {
    execSync(`pkill -f "${BINARY_PATH}"`, { stdio: "ignore" });
  } catch {
    // ignore
  }
  ensureDaemonRunning();
}

export function stopDaemon(): void {
  try {
    execSync(`pkill -f "${BINARY_PATH}"`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}
