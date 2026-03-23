import type { RuntimeState } from "../types.ts";
import { logger } from "../concerns/logger.ts";
import { TARGET_ROOT } from "../concerns/constants.ts";
import { broadcastToWebSocketClients } from "./websocket.ts";
import { scanProjectFiles } from "../domains/project.ts";

export function registerScanningRoutes(
  app: any,
  state: RuntimeState,
): void {
  app.get("/api/scan/project", async (c: any) => {
    try {
      const result = scanProjectFiles(TARGET_ROOT);
      return c.json(result);
    } catch (error) {
      logger.error({ err: error }, "Failed to scan project files");
      return c.json({ ok: false, error: "Failed to scan project." }, 500);
    }
  });

  app.post("/api/boot/skip-scan", async (c: any) => {
    broadcastToWebSocketClients({ type: "boot:scan:skipped" });
    return c.json({ ok: true, message: "Scan skipped." });
  });
}
