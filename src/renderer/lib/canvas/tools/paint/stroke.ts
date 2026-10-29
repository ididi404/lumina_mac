/** Brush/eraser drag stroke — stamps along pointer path, then commits. */
import type { Page } from "../../../../types";
import { canvas } from "../../index";
import {
  markSourcesDirty,
  blitCleanupIntoComposite,
  recompositeCleanupRegion,
} from "../../render";
import {
  ensureCleanupMask,
  ensureCleanupCanvas,
  stageToImg,
  paintSettings,
} from "./shared";
import { applyStroke, clearSprite } from "./strokes";
import { requireCleanup } from "./guard";
import { commitStrokeTracked } from "./commit";
import { updateCursor } from "./cursor";

let _dragging = false;
let _points: Array<{ x: number; y: number }> = [];
let _mode: "brush" | "eraser" | null = null;
/** Bounding box (image px) of current stroke — blitted per stamped segment. */
let _dirtyRect: { x: number; y: number; w: number; h: number } | null = null;
let _onMove: ((ev: MouseEvent | TouchEvent) => void) | null = null;
let _onUp: (() => void) | null = null;

/** Abort an in-progress stroke (e.g. tool switched mid-drag). */
export function cancelActiveStroke(): void {
  if (_onUp) _onUp();
}

export function handleStroke(
  page: Page,
  img: { x: number; y: number },
  mode: "brush" | "eraser",
): void {
  if (!requireCleanup(page)) return;
  ensureCleanupMask(page);
  ensureCleanupCanvas(page);
  clearSprite();
  _dragging = true;
  _mode = mode;
  _points = [{ x: img.x, y: img.y }];
  _dirtyRect = { x: img.x, y: img.y, w: 1, h: 1 };
  applyStroke(page, _points, _mode);
  const cc = page.cleanupMask?.cleanupCanvas;
  if (cc) markSourcesDirty([cc]);
  canvas.render();

  const getXY = function (ev: MouseEvent | TouchEvent): {
    x: number;
    y: number;
  } {
    const t = (ev as TouchEvent).touches || (ev as TouchEvent).changedTouches;
    if (t && t.length) return { x: t[0].clientX, y: t[0].clientY };
    const m = ev as MouseEvent;
    return { x: m.clientX, y: m.clientY };
  };

  const onMove = function (ev: MouseEvent | TouchEvent): void {
    if (!_dragging) return;
    const stage = canvas.getStage();
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const xy = getXY(ev);
    const p = stageToImg(xy.x - rect.left, xy.y - rect.top);
    _points.push(p);
    applyStroke(page, [_points[_points.length - 2], p], _mode!);
    updateCursor(xy.x - rect.left, xy.y - rect.top);
    // Extend the dirty box and blit the NEWLY painted region into the
    // composite — no full-page re-bake per move.
    if (_dirtyRect) {
      const m = paintSizePx();
      _dirtyRect.x = Math.min(_dirtyRect.x, p.x - m);
      _dirtyRect.y = Math.min(_dirtyRect.y, p.y - m);
      _dirtyRect.w = Math.max(_dirtyRect.w, p.x + m - _dirtyRect.x);
      _dirtyRect.h = Math.max(_dirtyRect.h, p.y + m - _dirtyRect.y);
    }
    // Eraser removes pixels — blit (source-over) can't reflect that, so
    // re-composite bg + inpaint + cleanup for the dirty region instead.
    if (_mode === "eraser") recompositeCleanupRegion(page, _dirtyRect!);
    else blitCleanupIntoComposite(page, _dirtyRect!);
    canvas.scheduleRender();
  };

  const onUp = function (): void {
    if (_onMove) {
      window.removeEventListener("mousemove", _onMove);
      window.removeEventListener("touchmove", _onMove);
    }
    if (_onUp) {
      window.removeEventListener("mouseup", _onUp);
      window.removeEventListener("touchend", _onUp);
    }
    _onMove = null;
    _onUp = null;
    if (!_dragging) return;
    _dragging = false;
    const changed = _points.length > 0;
    _mode = null;
    _points = [];
    _dirtyRect = null;
    void commitStrokeTracked(page, changed);
  };

  _onMove = onMove;
  _onUp = onUp;
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove);
  window.addEventListener("touchend", onUp);
}

/** Current brush/eraser diameter in image px (from paint settings). */
function paintSizePx(): number {
  return paintSettings().size;
}
