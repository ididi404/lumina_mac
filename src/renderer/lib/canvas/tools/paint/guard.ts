/** Paint tool guard — resolve brush/eraser/bucket target. */
import { state } from "../../../state";
import type { Page, InpaintMask, CleanupMask } from "../../../../types";
import {
  ensureCleanupMask,
  ensureCleanupCanvas,
  ensureInpaintCanvas,
} from "./shared";

export function isPaintTool(): boolean {
  const t = state.activeTool;
  return (
    t === "brush" || t === "eraser" || t === "bucket" || t === "eyedropper"
  );
}

export type PaintTarget =
  | {
      kind: "inpaint";
      mask: InpaintMask;
      canvas: HTMLCanvasElement;
      /** Canvas origin in page-image px */
      ox: number;
      oy: number;
    }
  | {
      kind: "cleanup";
      mask: CleanupMask;
      canvas: HTMLCanvasElement;
      ox: number;
      oy: number;
    };

/**
 * Brush target: selected AI inpaint patch if any, else the Cleanup layer.
 * Inpaint patches are fully editable — same brush/eraser/bucket as Cleanup.
 */
export function resolvePaintTarget(page: Page | null): PaintTarget | null {
  if (!page) return null;
  const sel = page._selectedMaskId;
  if (sel) {
    const inpaint = page.inpaintMasks.find(function (m) {
      return m.id === sel;
    });
    if (inpaint && inpaint.visible) {
      const c = ensureInpaintCanvas(inpaint);
      if (!c) return null;
      return {
        kind: "inpaint",
        mask: inpaint,
        canvas: c,
        ox: Math.round(inpaint.bbox.x),
        oy: Math.round(inpaint.bbox.y),
      };
    }
  }
  const mask = ensureCleanupMask(page);
  const c = ensureCleanupCanvas(page);
  if (!c) return null;
  return { kind: "cleanup", mask, canvas: c, ox: 0, oy: 0 };
}

/** @deprecated use resolvePaintTarget — kept for call sites that only need a boolean */
export function requireCleanup(page: Page | null): boolean {
  return !!resolvePaintTarget(page);
}
