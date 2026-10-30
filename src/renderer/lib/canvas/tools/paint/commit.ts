/** Stroke-end serialization — PNG cache + history snapshot. */
import { history } from "../../../history";
import { ui } from "../../../ui";
import * as i18n from "../../../i18n";
import { log } from "../../../logger";
import { canvas } from "../../index";
import { markSourcesDirty } from "../../render";
import { ensureCleanupCanvas } from "./shared";
import type { PaintTarget } from "./guard";
import type { Page, InpaintMask } from "../../../../types";

let _commitSeq = 0;

/** Latest in-flight stroke commit promise (resolves when idle). */
let _pending: Promise<void> = Promise.resolve();
export const pendingCommit: { current: Promise<void> } = { current: _pending };

async function canvasToPngBytes(
  c: HTMLCanvasElement,
): Promise<Uint8Array | null> {
  const blob: Blob | null = await new Promise(function (resolve) {
    c.toBlob(function (b) {
      resolve(b);
    }, "image/png");
  });
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/** Sync HTMLImageElement from edit canvas so export/history paths stay valid. */
function syncInpaintImage(mask: InpaintMask): void {
  const c = mask.editCanvas;
  if (!c) return;
  const img = new Image();
  img.src = c.toDataURL("image/png");
  mask.image = img;
}

export async function commitStroke(
  page: Page,
  changed: boolean,
  target: PaintTarget | null,
): Promise<void> {
  if (!target) {
    const c = ensureCleanupCanvas(page);
    if (!page.cleanupMask || !c) return;
    if (!changed) {
      history.snapshot();
      return;
    }
    target = {
      kind: "cleanup",
      mask: page.cleanupMask,
      canvas: c,
      ox: 0,
      oy: 0,
    };
  }

  if (!changed) {
    history.snapshot();
    return;
  }

  const seq = ++_commitSeq;
  const data = await canvasToPngBytes(target.canvas);
  if (!data) return;

  try {
    if (target.kind === "inpaint") {
      const mask = target.mask;
      const res = await window.lumina.writeTempPng({
        data,
        subdir: "inpaint-edit",
        name: mask.id,
      });
      if (seq !== _commitSeq) return;
      const live = page.inpaintMasks.find(function (m) {
        return m.id === mask.id;
      });
      if (!live || live !== mask) return;
      mask.imagePath = res.path;
      mask._hydrated = true;
      syncInpaintImage(mask);
      if (mask.editCanvas) markSourcesDirty([mask.editCanvas]);
      canvas.render();
      history.snapshot();
      return;
    }

    const mask = target.mask;
    const res = await window.lumina.writeTempPng({
      data,
      subdir: "cleanup",
      name: "cleanup",
    });
    if (seq !== _commitSeq) return;
    if (page.cleanupMask !== mask) return;
    mask.imagePath = res.path;
    mask._hydrated = true;
    canvas.render();
    history.snapshot();
  } catch (e) {
    log.error("fe", `Failed to persist paint stroke: ${e}`);
    ui.toast(i18n.t("toast.paintSaveFailed"), "error");
  }
}

/** Wrap commitStroke so pendingCommit tracks the latest in-flight write. */
export function commitStrokeTracked(
  page: Page,
  changed: boolean,
  target: PaintTarget | null = null,
): void {
  const p = commitStroke(page, changed, target);
  _pending = p;
  pendingCommit.current = p;
}
