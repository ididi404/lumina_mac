/**
 * Dev launcher — on macOS runs branded Lumina.app so Dock hover says Lumina.
 * Other platforms fall back to the stock `electron` binary.
 */
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainJs = path.join(ROOT, "dist", "main", "main.js");

let electronBin;
if (process.platform === "darwin") {
  const prep = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "prepare-dev-app.mjs")],
    { encoding: "utf8" },
  );
  if (prep.status !== 0) {
    if (prep.stderr) process.stderr.write(prep.stderr);
    process.exit(prep.status || 1);
  }
  // Path may contain spaces (e.g. ".../Lumina mac/...") — do NOT split.
  electronBin = (prep.stdout || "").trim();
  if (!electronBin || !fs.existsSync(electronBin)) {
    console.error(
      "prepare-dev-app.mjs did not return a valid Lumina binary path:",
      JSON.stringify(electronBin),
    );
    process.exit(1);
  }
} else {
  electronBin = require("electron");
}

const child = spawn(electronBin, [mainJs, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    // Branded Lumina.app makes Electron report isPackaged=true — force dev paths.
    LUMINA_DEV_RUNTIME: "1",
  },
});
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
