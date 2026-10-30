/** App paths — bundle dir, repo root, backend source. */
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { app } from "electron";

/** Directory of the compiled main bundle (dist/main). */
export const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Repo root — dist/main is always two levels below the project root. */
export const PROJECT_ROOT = path.join(MAIN_DIR, "../..");

/**
 * True only for real electron-builder installs.
 * Branded `build/dev-runtime/Lumina.app` sets LUMINA_DEV_RUNTIME=1 because
 * Electron then reports app.isPackaged=true even though we load dist/ from disk.
 */
export function isPackagedBuild(): boolean {
  if (process.env.LUMINA_DEV_RUNTIME === "1") return false;
  return app.isPackaged;
}

/** Backend source dir: resources/backend when packaged, python/ in dev. */
export function backendSourceDir(): string {
  return isPackagedBuild()
    ? path.join(process.resourcesPath, "backend")
    : path.join(PROJECT_ROOT, "python");
}

/**
 * Dev-time app icon path (packaged builds use the .app/.exe embedded icon).
 * Prefers platform-native formats when present.
 */
export function appIconPath(): string | null {
  if (isPackagedBuild()) return null;
  const dir = path.join(PROJECT_ROOT, "assets");
  // Prefer PNG for dock.setIcon — nativeImage loads it more reliably than icns.
  const names =
    process.platform === "darwin"
      ? ["icon.png", "icon.icns"]
      : process.platform === "win32"
        ? ["icon.ico", "icon.png"]
        : ["icon.png", "icon.ico"];
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
