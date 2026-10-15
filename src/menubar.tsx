import { Icon, MenuBarExtra, openCommandPreferences } from "@raycast/api";
import { useState, useEffect } from "react";
import { ensureDaemonRunning, isWatcherPaused, setWatcherPaused } from "./utils";

export default function Command() {
  const [paused, setPaused] = useState<boolean>(isWatcherPaused());

  useEffect(() => {
    try {
      ensureDaemonRunning();
      setPaused(isWatcherPaused());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleToggle = () => {
    const nextPaused = !paused;
    setWatcherPaused(nextPaused);
    setPaused(nextPaused);
  };

  return (
    <MenuBarExtra
      icon={paused ? Icon.Pause : Icon.Keyboard}
      title={paused ? "FA/EN" : "ABC"}
      tooltip="Raycast Rayglott Switcher"
    >
      <MenuBarExtra.Section title="Status">
        <MenuBarExtra.Item
          title={paused ? "Status: Paused (Manual)" : "Status: Active (Rayglott)"}
          icon={paused ? Icon.XMarkCircle : Icon.CheckCircle}
        />
      </MenuBarExtra.Section>

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title={paused ? "Enable Rayglott" : "Pause Rayglott"}
          icon={paused ? Icon.Play : Icon.Pause}
          onAction={handleToggle}
        />
        <MenuBarExtra.Item
          title="Hide Menu Bar Icon..."
          icon={Icon.EyeDisabled}
          onAction={() => openCommandPreferences()}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}