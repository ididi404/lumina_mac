/** Model downloads — queue + progress push. */
import { BrowserWindow } from "electron";
import { IPC } from "../../shared/bridge";
import { apiGet, apiPost } from "../backend/client";
import { handle, send } from "../core/ipc";
import { withDownloadMutex } from "../core/mutex";
import { log } from "../core/logger";

let win: BrowserWindow | null = null;

const POLL_MS = 500;
/** Cap wait so a wedged backend cannot hold the download mutex forever. */
const POLL_MAX_MS = 30 * 60 * 1000;

type ProgressPayload = {
  running: boolean;
  progress: number;
  downloaded: number;
  total: number;
  done: boolean;
  error: string | null;
  cancelled?: boolean;
  model?: string | null;
};

export function registerDownloadHandlers(target: BrowserWindow): void {
  win = target;
  handle(IPC.downloadModel, (_e, models: string[] = []) => {
    return withDownloadMutex(async () => {
      let start: unknown;
      try {
        start = await apiPost("/model/download", { models });
      } catch (err) {
        log.error(`model/download: ${err}`);
        return { error: String(err) };
      }

      const started = start as {
        status?: string;
        alreadyPresent?: boolean;
        detail?: unknown;
      };
      if (started?.alreadyPresent || started?.status === "ok") {
        const done: ProgressPayload = {
          running: false,
          progress: 100,
          downloaded: 0,
          total: 0,
          done: true,
          error: null,
        };
        if (win && !win.isDestroyed())
          send(win, IPC.modelDownloadProgress, done);
        return { status: "ok" };
      }

      const t0 = Date.now();
      return new Promise<{ error?: string; status?: string }>((resolve) => {
        const poll = setInterval(async () => {
          try {
            const p = (await apiGet("/model/progress")) as ProgressPayload;
            if (win && !win.isDestroyed())
              send(win, IPC.modelDownloadProgress, p);
            if (p.done || p.error || p.cancelled || !p.running) {
              clearInterval(poll);
              resolve(p.error ? { error: p.error } : { status: "ok" });
              return;
            }
            if (Date.now() - t0 > POLL_MAX_MS) {
              clearInterval(poll);
              resolve({ error: "Model download timed out" });
            }
          } catch (e) {
            // Backend hiccup — keep polling until timeout.
            if (Date.now() - t0 > POLL_MAX_MS) {
              clearInterval(poll);
              resolve({ error: String(e) });
            }
          }
        }, POLL_MS);
      });
    });
  });
  handle(IPC.cancelDownload, async () => {
    try {
      await apiPost("/model/cancel", {});
    } catch (err) {
      return { error: String(err) };
    }
  });
}
