/* ── Lumina Pipeline — Inpainting (LaMa via Python backend) ──
 * The backend returns one RGBA patch per detection box; each patch becomes
 * an independent mask layer (Photoshop-style) composited over the original
 * image. The renderer no longer swaps to a single cleaned image.
 */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { invalidateComposite } from "../canvas/render";
import { sidebar } from "../sidebar";
import { models } from "../models";
import { log } from "../logger";
import { flushDetBboxes } from "../canvas/detection/groups";
import type { BBox, InpaintMask } from "../../types";

/** Convert a Windows path to a loadable file:// URL */
function fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function loadImage(p: string): Promise<HTMLImageElement> {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error("Failed to load patch image: " + p));
    };
    img.src = fileUrl(p);
  });
}

function boxesOverlap(a: BBox, b: BBox): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

export const inpaint = {
  /** Inpaint text boxes of the active page → mask layers.
   *  Default (pipeline): every detection. Pass `{ onlySelected: true }` from
   *  the standalone Inpaint button to redo just the highlighted box. */
  run: async function (opts?: { onlySelected?: boolean }): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    if (!page.textDetections.length) {
      ui.toast(i18n.t("toast.inpaintNoText"), "warn");
      return;
    }

    flushDetBboxes();
    const selIdx = page._selectedTextIdx;
    const selective =
      !!opts?.onlySelected &&
      selIdx !== null &&
      selIdx >= 0 &&
      selIdx < page.textDetections.length;
    const targetBoxes = selective
      ? [page.textDetections[selIdx].bbox]
      : page.textDetections.map((d) => d.bbox);

    state.isRunning = true;

    const isFirstRun = !state._inpaintLoaded;
    const loadingToast = ui.toast(
      isFirstRun
        ? i18n.t("toast.inpaintFirstRun")
        : i18n.t("toast.inpaintRunning", { count: targetBoxes.length }),
      "running",
      0,
    );

    try {
      const model = models.selectedModel("inpaint") || "lama_manga";
      log.debug(
        "fe",
        `inpaint: start model=${model} boxes=${targetBoxes.length}` +
          (selective ? ` (selected #${selIdx + 1})` : " (all)"),
      );
      const result = await window.lumina.apiPost<{
        patches?: Array<{ bbox: BBox; imagePath: string }>;
        detail?: string;
      }>("/inpaint", {
        imagePath: page.filePath,
        maskPath: page.maskPath ?? null,
        boxes: targetBoxes,
        model,
      });
      if (!result || !Array.isArray(result.patches))
        throw new Error(result?.detail || "Inpaint failed");

      log.debug(
        "fe",
        `inpaint: done ${(result.patches || []).length} patch(es)`,
      );
      const ts = Date.now();
      const newMasks: InpaintMask[] = [];
      for (let i = 0; i < result.patches.length; i++) {
        const p = result.patches[i];
        const image = await loadImage(p.imagePath);
        newMasks.push({
          id: "mask-" + ts + "-" + i,
          bbox: p.bbox,
          imagePath: p.imagePath,
          visible: true,
          opacity: 1,
          image,
        });
      }

      if (selective) {
        // Keep other regions; replace any mask that overlaps the selected box.
        const kept = page.inpaintMasks.filter(function (m) {
          return !targetBoxes.some(function (b) {
            return boxesOverlap(m.bbox, b);
          });
        });
        page.inpaintMasks = kept.concat(newMasks);
      } else {
        page.inpaintMasks = newMasks;
      }

      // Hide detection overlays by default — masks are the visual stand-in —
      // but the toggle stays available for manual box edits / new boxes.
      state.showDetBoxes = false;
      state._inpaintLoaded = true;
      invalidateComposite(page.fileName);

      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.inpaintDone", { count: newMasks.length }),
        "success",
        3000,
      );
    } catch (err) {
      log.error("fe", `Inpaint: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast(
        (err as Error).message || i18n.t("toast.inpaintFailed"),
        "error",
      );
    } finally {
      state.isRunning = false;
    }
  },
};
