import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDashboard } from "../../context/DashboardContext.jsx";

export const Route = createFileRoute("/chat/$issueId")({
  component: ChatWithIssue,
});

/**
 * /chat/:issueId — redirects to /chat with the issue pre-selected.
 * The actual chat UI lives in /chat/index.jsx. This route sets the
 * selectedIssueId via a global event that the ChatPage listens to.
 */
function ChatWithIssue() {
  const { issueId } = Route.useParams();
  const navigate = useNavigate();
  const { issues } = useDashboard();

  useEffect(() => {
    // Dispatch a custom event that ChatPage can listen to
    window.dispatchEvent(new CustomEvent("spark:chat:select-issue", { detail: { issueId } }));
    // Navigate to /chat (the actual UI) — replace so back button works naturally
    navigate({ to: "/chat", replace: true });
  }, [issueId, navigate]);

  // Show nothing while redirecting
  return null;
}
