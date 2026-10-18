import { showHUD } from "@raycast/api";
import { toggleWatcher } from "./pause";

export default async function Command() {
  try {
    const isActive = toggleWatcher();
    if (isActive) {
      await showHUD("🟢 Raycast Rayglott: Enabled");
    } else {
      await showHUD("⏸️ Raycast Rayglott: Paused");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await showHUD(`❌ ${message}`);
  }
}
