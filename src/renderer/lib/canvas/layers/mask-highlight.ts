/** Selected-mask cue — fill the mask region once, then clear. */
import Konva from "konva";
import { state } from "../../state";
import { canvas } from "../index";
import type { InpaintMask, Page } from "../../../types";

const ACCENT = "#e94560";

let _layer: Konva.Layer | null = null;
let _node: Konva.Image | null = null;
let _anim: Konva.Animation | null = null;
/** Selection id we already flashed for — avoid re-trigger on every render. */
let _flashedForId: string | null = null;
let _loadToken = 0;

export function resetMaskHighlight(): void {
  _loadToken++;
  _stopAnim();
  if (_node) {
    _node.destroy();
    _node = null;
  }
  if (_layer) {
    _layer.destroy();
    _layer = null;
  }
  _flashedForId = null;
}

function _stopAnim(): void {
  if (_anim) {
    _anim.stop();
    _anim = null;
  }
}

function _getLayer(): Konva.Layer | null {
  const stage = canvas.getStage();
  if (!stage) return null;
  if (!_layer || _layer.getStage() !== stage) {
    _node = null;
    _layer = new Konva.Layer({ listening: false, name: "mask-highlight" });
    stage.add(_layer);
  }
  _layer.moveToTop();
  return _layer;
}

function _fileUrl(p: string): string {
  let norm = p.replace(/\\/g, "/");
  if (!norm.startsWith("/")) norm = "/" + norm;
  return "file://" + encodeURI(norm).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

/** Solid red wash clipped to source alpha (whole region, not a box). */
function _regionWash(
  source: CanvasImageSource,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/** One brief flash, then remove. */
function _flashOnce(node: Konva.Node): void {
  _stopAnim();
  node.opacity(0.55);
  const holdMs = 280;
  const fadeMs = 180;
  _anim = new Konva.Animation(function (frame) {
    if (!frame) return;
    const t = frame.time;
    if (t < holdMs) {
      node.opacity(0.55);
    } else if (t < holdMs + fadeMs) {
      node.opacity(0.55 * (1 - (t - holdMs) / fadeMs));
    } else {
      _stopAnim();
      if (_node === node) {
        node.destroy();
        _node = null;
        _layer?.draw();
      }
      return;
    }
    _layer?.batchDraw();
  }, _layer!);
  _anim.start();
}

function _placeWash(
  wash: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const layer = _getLayer();
  if (!layer) return;
  layer.destroyChildren();
  _node = null;
  const img = new Konva.Image({
    image: wash,
    x: x,
    y: y,
    width: w,
    height: h,
    listening: false,
    opacity: 0.55,
  });
  layer.add(img);
  _node = img;
  layer.draw();
  _flashOnce(img);
}

function _highlightInpaint(page: Page, mask: InpaintMask): void {
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  const bx = Math.round(mask.bbox.x);
  const by = Math.round(mask.bbox.y);
  const bw = Math.max(1, Math.round(mask.bbox.w));
  const bh = Math.max(1, Math.round(mask.bbox.h));
  const sx = off.x + bx * sr;
  const sy = off.y + by * sr;
  const sw = bw * sr;
  const sh = bh * sr;

  const apply = function (src: CanvasImageSource, iw: number, ih: number): void {
    _placeWash(_regionWash(src, iw, ih), sx, sy, sw, sh);
  };

  const src = mask.image;
  if (src && (src.naturalWidth || src.width) > 0) {
    apply(src, src.naturalWidth || src.width, src.naturalHeight || src.height);
    return;
  }

  if (!mask.imagePath) return;
  const token = ++_loadToken;
  const img = new Image();
  img.onload = function () {
    if (token !== _loadToken) return;
    if (page._selectedMaskId !== mask.id) return;
    // Still the same selection we intended to flash.
    if (_flashedForId !== mask.id) return;
    mask.image = img;
    apply(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  };
  img.src = _fileUrl(mask.imagePath);
}

function _highlightCleanup(page: Page): void {
  const cc = page.cleanupMask?.cleanupCanvas;
  if (!cc) return;
  const sr = canvas.getScaleRatio();
  const off = canvas.getOffset();
  _placeWash(
    _regionWash(cc, cc.width, cc.height),
    off.x,
    off.y,
    page.naturalWidth * sr,
    page.naturalHeight * sr,
  );
}

/**
 * Flash the selected mask region once when selection changes.
 * No-ops if we already flashed this same selection (e.g. canvas re-render).
 */
export function syncMaskHighlight(): void {
  const page = state.getActivePage();
  const stage = canvas.getStage();
  if (!page || !stage) {
    resetMaskHighlight();
    return;
  }

  const id = page._selectedMaskId;
  if (!id) {
    resetMaskHighlight();
    return;
  }

  // Already cued for this selection — don't flash again on every render.
  if (id === _flashedForId) return;

  const inpaint = page.inpaintMasks.find(function (m) {
    return m.id === id;
  });
  if (inpaint) {
    _flashedForId = id;
    _highlightInpaint(page, inpaint);
    return;
  }

  if (page.cleanupMask && page.cleanupMask.id === id) {
    _flashedForId = id;
    _highlightCleanup(page);
    return;
  }

  resetMaskHighlight();
}
