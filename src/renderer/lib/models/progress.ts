/** Wire backend progress events → subscribers + download toast. */
import * as i18n from "../i18n";
import { ui } from "../ui";
import { s } from "./state";
import type { DownloadProgress, RuntimeProgress } from "../../types";

export function initProgressHandlers(): void {
  // Forward model download progress to subscribers and drive the
  // global download toast (bottom-right: bar, size, speed).
  window.lumina.onDownloadProgress((p: DownloadProgress) => {
    s.downloading = p.running;
    for (const cb of s.progressCbs) cb(p);
    if (p.running) {
      if (!document.getElementById("dl-toast")) {
        const kindLabel = p.model
          ? i18n.t(
              "models.section" + p.model[0].toUpperCase() + p.model.slice(1),
            )
          : "";
        ui.downloadToast(
          i18n.t("toast.modelDownloading", { model: kindLabel }),
          () => {
            void window.lumina.cancelDownload().catch(() => {});
          },
        );
      }
      ui.updateDownloadToast(p.progress || 0, p.downloaded || 0, p.total || 0);
    } else if (p.done || p.error || p.cancelled) {
      const el = document.getElementById("dl-toast");
      if (el) el.remove();
      if (p.done) ui.toast(i18n.t("toast.modelDownloaded"), "success", 3000);
      else if (p.cancelled)
        ui.toast(i18n.t("toast.downloadCancelled"), "info", 3000);
    }
  });

  // CUDA runtime download — same toast, highest priority. While it runs,
  // model downloads and the app update queue behind it.
  window.lumina.onRuntimeProgress((p: RuntimeProgress) => {
    s.runtimeBusy = p.state === "downloading";
    if (p.state === "downloading") {
      if (!document.getElementById("dl-toast")) {
        ui.downloadToast(i18n.t("toast.runtimeDownloading"));
      }
      ui.updateDownloadToast(p.percent || 0, p.transferred || 0, p.total || 0);
    } else if (p.state === "ready") {
      const el = document.getElementById("dl-toast");
      if (el) el.remove();
      ui.toast(i18n.t("toast.runtimeInstalled"), "success", 4000);
    } else if (p.state === "error") {
      const el = document.getElementById("dl-toast");
      if (el) el.remove();
      ui.toast(i18n.t("toast.runtimeError"), "error", 8000);
    }
  });

  // Main download mutex — used for CUDA runtime / update serialization.
  // Do NOT mirror into model progressCbs (that falsely looks like a model
  // download and can leave the UI thinking a transfer is in flight).
  window.lumina.onRuntimeBusy((busy) => {
    s.runtimeBusy = busy;
    for (const cb of s.runtimeCbs)
      cb({ state: busy ? "downloading" : "ready" });
  });
}
