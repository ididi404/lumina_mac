/**
 * Deprecated alias — branding lives in prepare-dev-app.mjs.
 * Kept for any leftover hooks that still call this file.
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

if (process.platform !== "darwin") process.exit(0);

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "prepare-dev-app.mjs",
);
const r = spawnSync(process.execPath, [script], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
process.exit(r.status || 0);
