/**
 * Build a branded Lumina.app for unpackaged `npm start`.
 *
 * Dock hover text on macOS follows the .app folder name — launching the
 * stock Electron.app always shows "Electron" regardless of CFBundleName.
 * Packaged builds already ship as Lumina.app via electron-builder.
 *
 * stdout: absolute path to the Lumina binary (single line, may contain spaces).
 * Progress messages go to stderr.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "build", "dev-runtime");
const OUT_APP = path.join(OUT_DIR, "Lumina.app");
const OUT_BIN = path.join(OUT_APP, "Contents", "MacOS", "Lumina");
const ICON_SRC = path.join(ROOT, "assets", "icon.icns");

if (process.platform !== "darwin") {
  process.exit(0);
}

let electronPkg;
try {
  electronPkg = path.dirname(require.resolve("electron/package.json"));
} catch {
  console.error("electron package not found — run npm install");
  process.exit(1);
}

const srcApp = path.join(electronPkg, "dist", "Electron.app");
if (!fs.existsSync(srcApp)) {
  console.error("Electron.app missing — run npm install");
  process.exit(1);
}

const srcVersion = fs
  .readFileSync(path.join(electronPkg, "dist", "version"), "utf8")
  .trim();
const stampPath = path.join(OUT_DIR, ".stamp");
const stampWant = [
  srcVersion,
  fs.existsSync(ICON_SRC) ? String(fs.statSync(ICON_SRC).mtimeMs) : "noicon",
].join("|");

const reusable =
  fs.existsSync(OUT_BIN) &&
  fs.existsSync(stampPath) &&
  fs.readFileSync(stampPath, "utf8") === stampWant;

if (!reusable) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(OUT_APP, { recursive: true, force: true });
  execFileSync("cp", ["-R", srcApp, OUT_APP], { stdio: "ignore" });

  const macos = path.join(OUT_APP, "Contents", "MacOS");
  const execSrc = path.join(macos, "Electron");
  if (fs.existsSync(execSrc)) fs.renameSync(execSrc, OUT_BIN);

  const plistPath = path.join(OUT_APP, "Contents", "Info.plist");
  let xml = fs.readFileSync(plistPath, "utf8");
  for (const [key, value] of [
    ["CFBundleName", "Lumina"],
    ["CFBundleDisplayName", "Lumina"],
    ["CFBundleExecutable", "Lumina"],
    ["CFBundleIdentifier", "com.lumina.app.dev"],
  ]) {
    const re = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
    if (re.test(xml)) {
      xml = xml.replace(re, `$1${value}$3`);
    } else {
      xml = xml.replace(
        /<\/dict>\s*<\/plist>\s*$/,
        `  <key>${key}</key>\n  <string>${value}</string>\n</dict>\n</plist>\n`,
      );
    }
  }
  fs.writeFileSync(plistPath, xml);

  const icnsDest = path.join(OUT_APP, "Contents", "Resources", "electron.icns");
  if (fs.existsSync(ICON_SRC)) fs.copyFileSync(ICON_SRC, icnsDest);

  fs.writeFileSync(stampPath, stampWant);
  console.error("Prepared build/dev-runtime/Lumina.app");
}

try {
  execFileSync(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", OUT_APP],
    { stdio: "ignore" },
  );
} catch {
  /* ignore */
}

// Single-line absolute path — must not be split on spaces by the caller.
process.stdout.write(OUT_BIN);
