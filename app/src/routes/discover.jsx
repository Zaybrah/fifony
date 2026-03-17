import { createFileRoute, useNavigate } from "@tanstack/react-router";
import DiscoveredIssuesView from "../components/DiscoveredIssuesView";

export const Route = createFileRoute("/discover")({
  component: DiscoverPage,
});

function DiscoverPage() {
  const navigate = useNavigate();
  return (
    <DiscoveredIssuesView onBack={() => navigate({ to: "/issues" })} />
  );
}
