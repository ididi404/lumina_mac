/** Bucket fill — flood-fills paint target against composite (single click). */
import type { Page } from "../../../../types";
import { canvas } from "../../index";
import {
  blitCleanupIntoComposite,
  blitInpaintIntoComposite,
} from "../../render";
import { applyBucket, clearSprite } from "./strokes";
import { resolvePaintTarget } from "./guard";
import { commitStrokeTracked } from "./commit";

export function handleBucket(page: Page, img: { x: number; y: number }): void {
  const target = resolvePaintTarget(page);
  if (!target) return;
  clearSprite();
  const rect = applyBucket(page, img.x, img.y, target);
  // Blit only the filled region into the composite (full-page re-bake would
  // be wasteful — the fill is usually a small patch).
  if (rect) {
    if (target.kind === "inpaint")
      blitInpaintIntoComposite(page, target.mask, rect);
    else blitCleanupIntoComposite(page, rect);
  }
  canvas.render();
  // Bucket is a single synchronous click — commit right away (the
  // snapshot is taken at stroke-end, same undo granularity as brush).
  void commitStrokeTracked(page, !!rect, target);
}
