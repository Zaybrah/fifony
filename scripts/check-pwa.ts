import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST_DIR = resolve(ROOT, "app/dist");
const MANIFEST_PATH = resolve(DIST_DIR, "manifest.webmanifest");
const SERVICE_WORKER_PATH = resolve(DIST_DIR, "service-worker.js");
const INDEX_PATH = resolve(DIST_DIR, "index.html");
const OFFLINE_PATH = resolve(DIST_DIR, "offline.html");

const requiredFiles = [
  INDEX_PATH,
  MANIFEST_PATH,
  SERVICE_WORKER_PATH,
  OFFLINE_PATH,
];

const errors: string[] = [];
const warnings: string[] = [];

function fail(message: string) {
  errors.push(message);
}

function warn(message: string) {
  warnings.push(message);
}

for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`Missing build artifact: ${file.replace(`${ROOT}/`, "")}`);
}

if (errors.length === 0) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    id?: string;
    name?: string;
    short_name?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    icons?: Array<{ src?: string; purpose?: string; sizes?: string }>;
    shortcuts?: Array<{ url?: string; name?: string }>;
  };

  const serviceWorker = readFileSync(SERVICE_WORKER_PATH, "utf8");
  const indexHtml = readFileSync(INDEX_PATH, "utf8");

  if (!manifest.id) fail("Manifest is missing `id`.");
  if (!manifest.name) fail("Manifest is missing `name`.");
  if (!manifest.short_name) fail("Manifest is missing `short_name`.");
  if (!manifest.start_url?.startsWith("/")) fail("Manifest `start_url` must be root-relative.");
  if (!manifest.scope?.startsWith("/")) fail("Manifest `scope` must be root-relative.");
  if (!["standalone", "fullscreen", "minimal-ui"].includes(manifest.display ?? "")) {
    fail("Manifest `display` should be one of standalone/fullscreen/minimal-ui.");
  }

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    fail("Manifest must include icons.");
  } else {
    const has192 = manifest.icons.some((icon) => icon.sizes === "192x192");
    const has512 = manifest.icons.some((icon) => icon.sizes === "512x512");
    const hasMaskable = manifest.icons.some((icon) => icon.purpose?.includes("maskable"));

    if (!has192) fail("Manifest is missing a 192x192 icon.");
    if (!has512) fail("Manifest is missing a 512x512 icon.");
    if (!hasMaskable) warn("Manifest does not include a maskable icon.");

    for (const icon of manifest.icons) {
      if (!icon.src?.startsWith("/")) {
        fail(`Manifest icon must be root-relative: ${icon.src ?? "<missing>"}`);
        continue;
      }
      const iconPath = resolve(DIST_DIR, icon.src.slice(1));
      if (!existsSync(iconPath)) {
        fail(`Manifest icon file does not exist: app/dist/${icon.src.slice(1)}`);
      }
    }
  }

  for (const shortcut of manifest.shortcuts ?? []) {
    if (!shortcut.name) fail("Manifest shortcut is missing `name`.");
    if (!shortcut.url?.startsWith("/")) fail(`Manifest shortcut URL must be root-relative: ${shortcut.url ?? "<missing>"}`);
  }

  if (!indexHtml.includes("manifest.webmanifest")) {
    fail("index.html does not reference the web manifest.");
  }

  if (serviceWorker.includes("__BUILD_TIMESTAMP__")) {
    fail("service-worker.js still contains the build timestamp placeholder.");
  }
  if (!serviceWorker.includes("self.addEventListener(\"fetch\"")) {
    fail("service-worker.js does not define a fetch handler.");
  }
  if (!serviceWorker.includes("offline.html")) {
    fail("service-worker.js does not reference offline.html.");
  }
}

if (warnings.length > 0) {
  console.warn("PWA warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error("PWA check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("PWA check passed.");
