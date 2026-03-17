import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";

/** Fetch workflow config (plan/execute/review stages). */
export function useWorkflowConfig() {
  return useQuery({
    queryKey: ["workflow-config"],
    queryFn: () => api.get("/config/workflow"),
    staleTime: 60_000,
  });
}
