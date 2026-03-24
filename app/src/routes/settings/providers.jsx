import { createFileRoute } from "@tanstack/react-router";
import { useProvidersUsage } from "../../hooks";
import ProvidersView from "../../components/ProvidersView";

export const Route = createFileRoute("/settings/providers")({
  component: ProviderSettings,
});

function ProviderSettings() {
  const providersUsage = useProvidersUsage();
  return <ProvidersView providersUsage={providersUsage} />;
}
