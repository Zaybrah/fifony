import { createFileRoute } from "@tanstack/react-router";
import { useDashboard } from "../../context/DashboardContext";
import { ThemeSection } from "../../components/SettingsView";

export const Route = createFileRoute("/settings/preferences")({
  component: PreferenceSettings,
});

function PreferenceSettings() {
  const ctx = useDashboard();

  return (
    <div className="space-y-5">
      <ThemeSection theme={ctx.theme} onThemeChange={ctx.setTheme} />
    </div>
  );
}

