/** Text Tool — in-place editing (caret overlay; canvas glyphs stay put). */
import Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import {
  imgToStage,
  getEditor,
  setEditor,
  setEditingLayerId,
  getEditingLayerId,
} from "./shared";
import { layerTextNodes } from "./shared";
import { getTransformer } from "./transformer";
import { refreshNodeGlyphs } from "./node-factory";

/** Commit and remove editor. Empty text on existing layer deletes it. */
export function removeEditor(commit: boolean): void {
  const ta = getEditor();
  if (!ta) return;
  const id = getEditingLayerId();
  const node = id
    ? layerTextNodes.find(function (n) {
        return n.getAttr("layerId") === id;
      })
    : null;
  const box = node
    ? node.findOne<Konva.Rect>(".layer-text-box")
    : null;
  setEditor(null);
  setEditingLayerId(null);
  ta.remove();
  if (commit && id) {
    const value = ta.value.trim();
    const page = state.getActivePage();
    const lay = page
      ? page.layers.find(function (l) {
          return l.id === id;
        })
      : null;
    if (lay) {
      const sr = canvas.getScaleRatio();
      if (box) {
        lay.bbox.w = Math.max(8, Math.round(box.width() / sr));
        lay.bbox.h = Math.max(8, Math.round(box.height() / sr));
      } else {
        const rect = ta.getBoundingClientRect();
        lay.bbox.w = Math.max(8, Math.round(rect.width / sr));
        lay.bbox.h = Math.max(8, Math.round(rect.height / sr));
      }
    }
    if (!value) {
      canvas.deleteLayer(id);
    } else {
      if (page) page._selectedLayerId = id;
      canvas.setLayerText(id, "translation", value);
    }
  } else {
    canvas.render();
  }
}

/** True when the last pointer press falls on the edited box / handles. */
function _pressInsideBox(): boolean {
  const stage = canvas.getStage();
  const id = getEditingLayerId();
  if (!stage || !id) return false;
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === id;
  });
  if (!node) return false;
  const pos = stage.getPointerPosition();
  if (!pos) return false;
  const box = node.getClientRect();
  const M = 16;
  return (
    pos.x >= box.x - M &&
    pos.x <= box.x + box.width + M &&
    pos.y >= box.y - M &&
    pos.y <= box.y + box.height + M
  );
}

document.addEventListener("mousedown", function (e) {
  if (!getEditor() || !getEditingLayerId()) return;
  const t = e.target as Node | null;
  if (t && (t as Element).closest?.("#type-section")) return;
  if (!_pressInsideBox()) removeEditor(true);
});

/**
 * Open a caret-only textarea over the box. Canvas glyphs stay visible and
 * are the only painted text — entering edit must not replace/move them.
 */
export function startEdit(layerId: string): void {
  const page = state.getActivePage();
  const konvaLayer = canvas.getLayer();
  if (!page || !konvaLayer || getEditor()) return;
  const lay = page.layers.find(function (l) {
    return l.id === layerId;
  });
  if (!lay) return;
  const initial = lay.translation || lay.source || "";

  const sr = canvas.getScaleRatio();
  const typo = lay.typography;
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === layerId;
  });
  const box = node
    ? node.findOne<Konva.Rect>(".layer-text-box")
    : null;
  const boxW = box ? box.width() : Math.max(1, lay.bbox.w * sr);
  const boxH = box ? box.height() : Math.max(1, lay.bbox.h * sr);
  const p = node
    ? { x: node.x(), y: node.y() }
    : imgToStage(lay.bbox.x, lay.bbox.y);
  const glyph = node
    ? node.findOne<Konva.Text>(".layer-text-glyphs")
    : null;
  const dispFs = glyph && glyph.fontSize() > 0 ? glyph.fontSize() : Math.max(8, lay.bbox.h * 0.6) * sr;

  const ta = document.createElement("textarea");
  ta.id = "text-tool-editor";
  ta.value = initial;
  ta.style.position = "absolute";
  ta.style.left = p.x + "px";
  ta.style.top = p.y + "px";
  ta.style.width = boxW + "px";
  ta.style.height = boxH + "px";
  ta.style.boxSizing = "border-box";
  ta.style.minWidth = "0";
  ta.style.minHeight = "0";
  // Dim the box so edit mode is obvious; text itself stays on the canvas.
  ta.style.background = "rgba(14,14,16,0.2)";
  ta.style.color = "transparent";
  ta.style.webkitTextFillColor = "transparent";
  ta.style.caretColor = typo.color || "#ffffff";
  ta.style.border = "none";
  ta.style.borderRadius = "2px";
  ta.style.padding = "0";
  ta.style.margin = "0";
  ta.style.fontSize = dispFs + "px";
  ta.style.fontFamily = typo.fontFamily || "Arial, sans-serif";
  ta.style.fontStyle = typo.fontStyle;
  ta.style.fontWeight = String(typo.fontWeight);
  ta.style.textAlign = typo.align;
  ta.style.lineHeight = typo.direction === "vertical" ? "1" : "1.2";
  ta.style.resize = "none";
  ta.style.outline = "none";
  ta.style.overflow = "hidden";
  ta.style.zIndex = "50";
  if (typo.direction === "vertical") {
    ta.style.writingMode = "vertical-rl";
    ta.style.textOrientation = "upright";
  } else {
    ta.style.writingMode = "horizontal-tb";
    ta.style.textOrientation = "";
  }
  const rot = lay.bbox.rotation || lay.typography.rotation || 0;
  if (rot !== 0) {
    ta.style.transformOrigin = "center center";
    ta.style.transform = "rotate(" + rot + "deg)";
  }

  // Glyphs stay visible — do NOT hide them (that caused the jump / double text).
  page._selectedLayerId = layerId;
  const tr = getTransformer();
  if (tr && node) {
    tr.nodes([node]);
    node.draggable(true);
  }
  konvaLayer.draw();

  ta.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      removeEditor(true);
    }
  });
  ta.addEventListener("input", function () {
    lay.translation = ta.value;
    if (node) refreshNodeGlyphs(node, lay, ta.value);
  });
  ta.addEventListener("blur", function (e) {
    const next = e.relatedTarget as Node | null;
    if (next && (next as Element).closest?.("#type-section")) return;
    if (_pressInsideBox()) return;
    removeEditor(true);
  });

  canvas.getStage()?.container().appendChild(ta);
  setEditor(ta);
  setEditingLayerId(layerId);
  ta.focus();
  ta.select();
}

/** Re-apply editing visuals after canvas.render() (zoom/pan/resize). */
export function refreshEditingState(): void {
  const id = getEditingLayerId();
  const ta = getEditor();
  if (!id || !ta) return;
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === id;
  });
  if (!node) return;
  // Keep glyphs painted — caret overlay only.
  node.getChildren().forEach(function (c) {
    const n = c.name();
    if (n === "layer-text-glyphs" || n === "layer-text-glyphs-col") {
      c.visible(true);
    }
  });
  const tr = getTransformer();
  if (tr) {
    tr.nodes([node]);
    node.draggable(true);
  }
  syncEditorBox();
}

/** Re-position the caret overlay after box resize while editing. */
export function syncEditorBox(): void {
  const ta = getEditor();
  const id = getEditingLayerId();
  if (!ta || !id) return;
  const page = state.getActivePage();
  if (!page) return;
  const lay = page.layers.find(function (l) {
    return l.id === id;
  });
  if (!lay) return;
  const sr = canvas.getScaleRatio();
  const node = layerTextNodes.find(function (n) {
    return n.getAttr("layerId") === id;
  });
  const box = node
    ? node.findOne<Konva.Rect>(".layer-text-box")
    : null;
  const boxW = box ? box.width() : lay.bbox.w * sr;
  const boxH = box ? box.height() : lay.bbox.h * sr;
  const p = node
    ? { x: node.x(), y: node.y() }
    : imgToStage(lay.bbox.x, lay.bbox.y);
  ta.style.left = p.x + "px";
  ta.style.top = p.y + "px";
  ta.style.width = boxW + "px";
  ta.style.height = boxH + "px";
  const glyph = node
    ? node.findOne<Konva.Text>(".layer-text-glyphs")
    : null;
  if (glyph && glyph.fontSize() > 0) {
    ta.style.fontSize = glyph.fontSize() + "px";
  }
  const rot = lay.bbox.rotation || lay.typography.rotation || 0;
  if (rot !== 0) {
    ta.style.transformOrigin = "center center";
    ta.style.transform = "rotate(" + rot + "deg)";
  } else {
    ta.style.transform = "";
  }
  // Live-paint glyphs to the current box size while editing.
  if (node) refreshNodeGlyphs(node, lay, ta.value);
}
