import { ensureDaemonRunning } from "./daemon";
import { isPaused, setPaused, readState } from "./state";

export function isWatcherPaused(): boolean {
  return isPaused();
}

export function setWatcherPaused(paused: boolean): void {
  ensureDaemonRunning();
  setPaused(paused);
}

export function toggleWatcher(): boolean {
  const nextState = !isWatcherPaused();
  setWatcherPaused(nextState);
  return !nextState; // true = Active, false = Paused
}

export { readState };
