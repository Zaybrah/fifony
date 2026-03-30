import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api.js";
import { sendWsMessage } from "../hooks.js";

// ── Mesh entry pub/sub (WS push) ────────────────────────────────

const meshEntrySubs = new Set();

export function dispatchMeshEntry(entry) {
  for (const cb of meshEntrySubs) cb(entry);
}

// ── Hook: full mesh graph + live traffic ─────────────────────────

export function useMesh() {
  const [graph, setGraph] = useState(null);
  const [traffic, setTraffic] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchGraph = useCallback(async () => {
    try {
      const res = await api.get("/mesh");
      if (res?.graph) setGraph(res.graph);
    } catch {}
  }, []);

  const fetchTraffic = useCallback(async () => {
    try {
      const res = await api.get("/mesh/traffic?limit=200");
      if (res?.entries) setTraffic(res.entries);
    } catch {}
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get("/mesh/status");
      if (res) setStatus(res);
    } catch {}
  }, []);

  const clearMesh = useCallback(async () => {
    try {
      await api.post("/mesh/clear", {});
      setTraffic([]);
      await fetchGraph();
    } catch {}
  }, [fetchGraph]);

  // Initial fetch — only call graph/traffic if proxy is running
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/mesh/status");
        if (res) setStatus(res);
        if (res?.running) {
          await Promise.all([fetchGraph(), fetchTraffic()]);
        }
      } catch {}
      setLoading(false);
    })();
  }, [fetchGraph, fetchTraffic]);

  // Subscribe to mesh WS room
  useEffect(() => {
    sendWsMessage({ type: "mesh:subscribe" });

    const handler = (entry) => {
      setTraffic((prev) => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(-500) : next;
      });
      fetchGraph();
    };
    meshEntrySubs.add(handler);

    return () => {
      meshEntrySubs.delete(handler);
      sendWsMessage({ type: "mesh:unsubscribe" });
    };
  }, [fetchGraph]);

  const toggleMesh = useCallback(async (enabled) => {
    try {
      const res = await api.post("/mesh/toggle", { enabled });
      setStatus((prev) => ({ ...prev, enabled, running: res.running, port: res.port }));
      if (enabled) {
        fetchGraph();
        fetchTraffic();
      } else {
        setGraph(null);
        setTraffic([]);
      }
    } catch {}
  }, [fetchGraph, fetchTraffic]);

  return { graph, traffic, status, loading, refresh: fetchGraph, clearMesh, toggleMesh };
}
