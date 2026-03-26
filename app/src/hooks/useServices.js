import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api.js";

/**
 * Fetches all service statuses and polls every 3s.
 */
export function useServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const res = await api.get("/services");
      if (res?.services) setServices(res.services);
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const id = setInterval(fetchAll, 3_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  return { services, loading, refresh: fetchAll };
}

/**
 * SSE-based log viewer for a single service.
 * Connects to the SSE stream endpoint for real-time log delivery.
 * Falls back to polling if SSE is not supported or fails.
 * Returns { log, connected } — connected = true once first data arrives.
 */
export function useServiceLog(id, enabled = false) {
  const [log, setLog] = useState("");
  const [connected, setConnected] = useState(false);
  const sizeRef = useRef(0);

  useEffect(() => {
    if (!enabled || !id) {
      setLog("");
      setConnected(false);
      sizeRef.current = 0;
      return;
    }

    let alive = true;
    let es = null;
    let pollIntervalId = null;
    let usingPoll = false;

    // ── SSE path ──────────────────────────────────────────────────────────────

    function startPoll() {
      usingPoll = true;
      sizeRef.current = 0;

      const fetchLog = async () => {
        if (!alive) return;
        try {
          const after = sizeRef.current;
          const res = after > 0
            ? await api.get(`/services/${id}/log?after=${after}`)
            : await api.get(`/services/${id}/log`);
          if (!alive) return;

          if (after > 0 && res.text !== undefined) {
            if (res.text) setLog((prev) => prev + res.text);
          } else if (res.logTail !== undefined) {
            setLog(res.logTail ?? "");
          }

          if (res.logSize !== undefined) sizeRef.current = res.logSize;
          setConnected(true);
        } catch {
          if (!alive) return;
          setConnected(false);
        }
      };

      fetchLog();
      pollIntervalId = setInterval(fetchLog, 2_000);
    }

    function startSSE() {
      try {
        es = new EventSource(`/api/services/${encodeURIComponent(id)}/stream`);

        es.onmessage = (event) => {
          if (!alive) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "init") {
              setLog(msg.text ?? "");
              sizeRef.current = msg.size ?? 0;
              setConnected(true);
            } else if (msg.type === "chunk") {
              if (msg.text) setLog((prev) => prev + msg.text);
              sizeRef.current = msg.size ?? sizeRef.current;
              setConnected(true);
            } else if (msg.type === "status") {
              // service stopped/crashed — stay connected to show final log
              setConnected(true);
            }
          } catch { /* malformed message */ }
        };

        es.onerror = () => {
          if (!alive) return;
          // SSE failed — fall back to polling
          if (es) { es.close(); es = null; }
          if (!usingPoll) startPoll();
        };
      } catch {
        // EventSource not supported or failed to construct
        startPoll();
      }
    }

    startSSE();

    return () => {
      alive = false;
      if (es) { es.close(); es = null; }
      if (pollIntervalId) clearInterval(pollIntervalId);
      setConnected(false);
      sizeRef.current = 0;
    };
  }, [id, enabled]);

  return { log, connected };
}
