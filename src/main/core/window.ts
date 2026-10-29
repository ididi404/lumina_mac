/** App window — create, focus, close guard, open path. */
import { BrowserWindow, shell } from "electron";
import path from "path";
import { IPC } from "../../shared/bridge";
import { handle, send } from "./ipc";
import { MAIN_DIR } from "./paths";

let win: BrowserWindow | null = null;
let allowClose = false;
let pendingOpenPath: string | null = null;

export function getWindow(): BrowserWindow | null {
  return win;
}

export function getPendingOpenPath(): string | null {
  return pendingOpenPath;
}

export function setPendingOpenPath(p: string | null): void {
  pendingOpenPath = p;
}

export function findLumiPath(args: string[]): string | null {
  for (const a of args) {
    if (!a || a.startsWith("-")) continue;
    if (a.startsWith("--") && a.includes("=")) continue;
    if (a.trim().toLowerCase().endsWith(".lmi")) return a;
  }
  return null;
}

/** Custom header height (Tailwind h-11). Traffic lights center in this band. */
const HEADER_H = 44;
/** Approximate macOS traffic-light control height. */
const TRAFFIC_H = 12;
/** Between geometric center (0→y16, too low) and -5 (y11, too high). */
const TRAFFIC_Y_NUDGE = -2;

export function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const trafficPos = {
    x: 16,
    y: Math.max(0, Math.round((HEADER_H - TRAFFIC_H) / 2) + TRAFFIC_Y_NUDGE),
  };
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: "Lumina",
    // macOS: hiddenInset + traffic lights on the left.
    // Windows: hidden + titleBarOverlay controls on the right.
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(isMac
      ? {
          trafficLightPosition: trafficPos,
        }
      : {
          titleBarOverlay: {
            color: "#1e1e1e",
            symbolColor: "#969696",
            height: HEADER_H,
          },
        }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(MAIN_DIR, "../preload/preload.cjs"),
    },
  });
  win.loadFile(path.join(MAIN_DIR, "../renderer/index.html"));
  // Re-assert after show — some Electron/macOS builds ignore constructor y
  // until the window is on screen.
  if (isMac) {
    win.once("ready-to-show", () => {
      win?.setWindowButtonPosition(trafficPos);
    });
  }
  // Force chrome insets from the main process — do NOT depend on data-platform
  // (renderer class can race CSP / load order and silently fail).
  win.webContents.on("dom-ready", () => {
    if (isMac) {
      void win?.webContents.insertCSS(`
        .titlebar-traffic-spacer {
          display: block !important;
          flex-shrink: 0 !important;
          width: 78px !important;
          min-width: 78px !important;
          height: 1px !important;
        }
        /* Full-bleed titlebar so traffic lights sit in the same 44px band. */
        header.drag-region {
          margin-left: -0.375rem !important;
          margin-right: -0.375rem !important;
          padding-left: 2px !important;
          padding-right: 8px !important;
          border-radius: 0 !important;
          border-left: none !important;
          border-right: none !important;
          border-top: none !important;
        }
      `);
      win?.setWindowButtonPosition(trafficPos);
    } else if (process.platform === "win32") {
      void win?.webContents.insertCSS(`
        header.drag-region { padding-right: 140px !important; }
        .titlebar-traffic-spacer { display: none !important; width: 0 !important; }
      `);
    }
    void win?.webContents.executeJavaScript(
      `document.documentElement.dataset.platform=${JSON.stringify(process.platform)};document.documentElement.classList.add(${JSON.stringify("platform-" + process.platform)});`,
    );
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://"))
      void shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("close", (e) => {
    if (allowClose) return;
    const wc = win?.webContents;
    if (!wc || wc.isLoading()) return;
    e.preventDefault();
    wc.send(IPC.requestCloseCheck);
  });
  win.on("closed", () => {
    win = null;
    allowClose = false;
  });
  handle(IPC.pendingOpenPath, () => pendingOpenPath);
  handle(IPC.confirmClose, (_e, ok: boolean) => {
    allowClose = !!ok;
    if (allowClose && win) win.close();
  });
  return win;
}

export function focusWindow(openPath?: string | null): void {
  if (!win) {
    if (openPath) pendingOpenPath = openPath;
    return;
  }
  if (win.isMinimized()) win.restore();
  win.focus();
  if (openPath) send(win, IPC.openProjectRequest, openPath);
}
