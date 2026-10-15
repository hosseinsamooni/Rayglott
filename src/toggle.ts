import { showHUD } from "@raycast/api";
import { toggleWatcher } from "./utils";

export default async function Command() {
  try {
    const isActive = toggleWatcher();
    if (isActive) {
      await showHUD("🟢 Raycast Rayglott: Enabled");
    } else {
      await showHUD("⏸️ Raycast Rayglott: Paused");
    }
  } catch (error) {
    await showHUD("❌ Failed to toggle Watcher (Check Xcode Command Line Tools)");
  }
}