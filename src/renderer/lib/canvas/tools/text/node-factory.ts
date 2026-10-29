/** Konva.Text node factory — visual + interactive. */
import Konva from "konva";
import { canvas } from "../../index";
import type { PageLayer, Typography } from "../../../../types";
import { imgToStage } from "./shared";
import {
  fitTextToBox,
  selectPreset,
  wordWrap,
  layoutVerticalColumns,
  toVerticalChar,
} from "./font-fit";

const DEFAULT_FONT_SIZE = 42;

/** Map align → Konva verticalAlign for vertical text blocks. */
function verticalBlockAlign(
  align: Typography["align"],
): "top" | "middle" | "bottom" {
  if (align === "left") return "top";
  if (align === "right") return "bottom";
  return "middle";
}

export function makeNode(layer: PageLayer, text: string): Konva.Group {
  const sr = canvas.getScaleRatio();
  const p = imgToStage(layer.bbox.x, layer.bbox.y);
  const lw = Math.max(4, layer.bbox.w * sr);
  const lh = Math.max(4, layer.bbox.h * sr);
  const typo: Typography = layer.typography;
  const direction = typo.direction === "vertical" ? "vertical" : "horizontal";

  // null fontSize = continuous auto-fit (recompute every render / resize).
  // A concrete number locks the size until the user picks Auto-fit again.
  let imgFontSize: number;
  if (typo.fontSize != null && typo.fontSize > 0) {
    imgFontSize = typo.fontSize;
  } else if (text) {
    const fit = fitTextToBox(text, layer.bbox.w, layer.bbox.h, typo);
    imgFontSize = fit.fontSize;
    layer.fitStatus = fit.fitStatus;
  } else {
    imgFontSize = Math.max(8, Math.round(layer.bbox.h * 0.6)) || DEFAULT_FONT_SIZE;
  }

  // Top-left + rotation — same model as Konva.Transformer (rotateAroundCenter
  // adjusts x/y on handle drag). Panel rotation must use that same math.
  const rot = layer.bbox.rotation || layer.typography.rotation || 0;
  const group = new Konva.Group({
    name: "layer-text",
    layerId: layer.id,
    x: p.x,
    y: p.y,
    rotation: rot,
  });

  const empty = !text;
  group.add(
    new Konva.Rect({
      name: "layer-text-box",
      width: lw,
      height: lh,
      fill: "transparent",
      // Always draw a frame — filled boxes used to be stroke-less and looked
      // "missing" next to green detection overlays.
      stroke: empty ? "rgba(233, 69, 96, 0.55)" : "rgba(233, 69, 96, 0.45)",
      strokeWidth: 1,
      dash: empty ? [6, 4] : undefined,
      cornerRadius: 2,
    }),
  );

  if (direction === "vertical") {
    _addVerticalGlyphs(group, text, typo, imgFontSize, lw, lh, sr, layer.opacity);
  } else {
    _addHorizontalGlyphs(
      group,
      text,
      typo,
      imgFontSize,
      lw,
      lh,
      sr,
      layer,
    );
  }

  return group;
}

/** Resolve image-space font size for a layer + text (autofit or locked). */
function _resolveFontSize(layer: PageLayer, text: string): number {
  const typo = layer.typography;
  if (typo.fontSize != null && typo.fontSize > 0) return typo.fontSize;
  if (text) {
    const fit = fitTextToBox(text, layer.bbox.w, layer.bbox.h, typo);
    layer.fitStatus = fit.fitStatus;
    return fit.fontSize;
  }
  return Math.max(8, Math.round(layer.bbox.h * 0.6)) || DEFAULT_FONT_SIZE;
}

/**
 * Rebuild glyph children in-place (keep the group / box / transformer).
 * Used while editing so the canvas stays the single source of truth for
 * glyph position — the textarea is caret-only and must not paint text.
 */
export function refreshNodeGlyphs(
  group: Konva.Group,
  layer: PageLayer,
  text: string,
): void {
  const sr = canvas.getScaleRatio();
  const box = group.findOne<Konva.Rect>(".layer-text-box");
  const lw = box ? box.width() : Math.max(4, layer.bbox.w * sr);
  const lh = box ? box.height() : Math.max(4, layer.bbox.h * sr);
  group.getChildren().slice().forEach(function (c) {
    const n = c.name();
    if (n === "layer-text-glyphs" || n === "layer-text-glyphs-col") c.destroy();
  });
  const typo = layer.typography;
  const imgFontSize = _resolveFontSize(layer, text);
  const empty = !text;
  if (box) {
    box.stroke(empty ? "rgba(233, 69, 96, 0.55)" : "rgba(233, 69, 96, 0.45)");
    box.strokeWidth(1);
    box.dash(empty ? [6, 4] : []);
  }
  if (!text) {
    group.getLayer()?.batchDraw();
    return;
  }
  if (typo.direction === "vertical") {
    _addVerticalGlyphs(group, text, typo, imgFontSize, lw, lh, sr, layer.opacity);
  } else {
    _addHorizontalGlyphs(
      group,
      text,
      typo,
      imgFontSize,
      lw,
      lh,
      sr,
      layer,
    );
  }
  group.getLayer()?.batchDraw();
}

function _addHorizontalGlyphs(
  group: Konva.Group,
  text: string,
  typo: Typography,
  imgFontSize: number,
  lw: number,
  lh: number,
  sr: number,
  layer: PageLayer,
): void {
  const chars = text.replace(/[\s\n]/g, "").length;
  const preset = selectPreset(layer.bbox.w, layer.bbox.h, chars);
  const maxW = Math.max(4, layer.bbox.w * preset.widthUsageRatio);
  const wrappedText = wordWrap(text, imgFontSize, typo, maxW).join("\n");

  group.add(
    new Konva.Text({
      name: "layer-text-glyphs",
      x: 0,
      y: 0,
      width: lw,
      height: lh,
      text: wrappedText,
      fontSize: imgFontSize * sr,
      fontFamily: typo.fontFamily || "Arial, sans-serif",
      fontStyle: typo.fontStyle,
      fontVariant: typo.fontWeight >= 700 ? "bold" : "normal",
      wrap: "none",
      align: typo.align,
      verticalAlign: "middle",
      fill: typo.color,
      stroke: typo.strokeColor || undefined,
      strokeWidth: typo.strokeWidth * sr || 0,
      fillAfterStrokeEnabled: true,
      opacity: layer.opacity,
      listening: true,
    }),
  );
}

/**
 * Vertical CJK: columns right→left, chars top→bottom.
 * align left/center/right → block top/middle/bottom.
 */
function _addVerticalGlyphs(
  group: Konva.Group,
  text: string,
  typo: Typography,
  imgFontSize: number,
  lw: number,
  lh: number,
  sr: number,
  opacity: number,
): void {
  const fs = imgFontSize * sr;
  const cols = layoutVerticalColumns(
    text,
    imgFontSize,
    lw / sr,
    lh / sr,
  );
  if (!cols.length) return;

  const colW = fs;
  const totalW = cols.length * colW;
  const maxChars = Math.max(...cols.map((c) => c.length), 1);
  const totalH = maxChars * fs;
  const vAlign = verticalBlockAlign(typo.align);
  let originY = 0;
  if (vAlign === "middle") originY = (lh - totalH) / 2;
  else if (vAlign === "bottom") originY = lh - totalH;
  // Columns start from the right edge (vertical-rl).
  const originX = lw - totalW;

  cols.forEach(function (col, ci) {
    // Rightmost column first in layoutVerticalColumns order.
    const x = originX + (cols.length - 1 - ci) * colW;
    const colText = col.map(toVerticalChar).join("\n");
    group.add(
      new Konva.Text({
        name: ci === 0 ? "layer-text-glyphs" : "layer-text-glyphs-col",
        x: x,
        y: originY,
        width: colW,
        height: col.length * fs,
        text: colText,
        fontSize: fs,
        fontFamily: typo.fontFamily || "Arial, sans-serif",
        fontStyle: typo.fontStyle,
        fontVariant: typo.fontWeight >= 700 ? "bold" : "normal",
        wrap: "none",
        align: "center",
        verticalAlign: "top",
        lineHeight: 1,
        fill: typo.color,
        stroke: typo.strokeColor || undefined,
        strokeWidth: typo.strokeWidth * sr || 0,
        fillAfterStrokeEnabled: true,
        opacity: opacity,
        listening: true,
      }),
    );
  });
}
