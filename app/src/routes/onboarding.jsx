import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { SETTINGS_QUERY_KEY } from "../hooks";

const OnboardingWizard = lazy(() => import("../components/OnboardingWizard"));

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <span className="loading loading-spinner loading-lg" />
        </div>
      }
    >
      <OnboardingWizard
        onComplete={() => {
          qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
          navigate({ to: "/kanban" });
        }}
      />
    </Suspense>
  );
}

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});
