/** Text Tool — node lifecycle & event wiring (called from render.ts) */
import Konva from "konva";
import { state } from "../../../state";
import { canvas } from "../../index";
import { sidebar } from "../../../sidebar";
import { history } from "../../../history";
import {
  layerTextNodes,
  isEditing,
  stageToImg,
  getEditingLayerId,
} from "./shared";

// Manual double-click detection. selectLayer() full-renders, which destroys
// the node mid-gesture and breaks Konva's native dblclick — a timestamp
// check in the click handler is immune to that.
const _lastClickAt: Record<string, number> = {};
import { makeNode } from "./node-factory";
import {
  syncTransformerSelection,
  onNodeTransformEnd,
  resetTransformer,
  getTransformer,
} from "./transformer";
import { getEditor } from "./shared";
import { startEdit, syncEditorBox, refreshEditingState } from "./editor";

/**
 * Hit-test layer text for Move / Text (or while editing).
 *
 * Det-box mode: green boxes own picks — EXCEPT the free-text layer that is
 * still selected right after create (move until blank-click deselects; then
 * it cannot be re-selected while det boxes stay on).
 */
function _canSelectObjects(tool: string): boolean {
  return (
    tool === "select" ||
    tool === "text" ||
    tool === "lasso" ||
    tool === "rect"
  );
}

function layerTextListening(layerId: string, layerType: string): boolean {
  if (isEditing() && getEditingLayerId() === layerId) return true;
  if (isEditing()) return false;
  const t = state.activeTool;
  if (!_canSelectObjects(t)) return false;
  // Det-box mode: green overlays own picks for unselected dialogue, but a
  // selected text layer (from the sidebar or after OCR) must still receive
  // hits so its red handles / drag work.
  if (state.showDetBoxes) {
    const page = state.getActivePage();
    if (!page) return false;
    if (page._selectedLayerId === layerId) return true;
    return layerType === "text-free";
  }
  return true;
}

/** Rebuild all layer text nodes on stage (one Konva.Text per layer). */
export function renderLayerTextNodes(): void {
  const konvaLayer = canvas.getLayer();
  const page = state.getActivePage();
  layerTextNodes.forEach(function (n) {
    n.destroy();
  });
  layerTextNodes.length = 0;
  resetTransformer();
  if (!konvaLayer || !page) return;

  (page.layers || [])
    .slice()
    .reverse()
    .forEach(function (lay) {
      if (!lay.visible) return;
      if (lay.type !== "text-dialogue" && lay.type !== "text-free") return;
      // Det-box mode: green overlays own the canvas. Painting dialogue text
      // layers on top hid the 2px selection stroke (only visible while the
      // green box was dragged out from under the pink frame).
      if (lay.type === "text-dialogue" && state.showDetBoxes) return;
      const text = lay.translation || lay.source || "";
      const node = makeNode(lay, text);
      node.listening(layerTextListening(lay.id, lay.type));
      const selectThis = function (): void {
        if (page._selectedLayerId === lay.id) {
          syncTransformerSelection();
          return;
        }
        canvas.selectLayer(lay.id);
        syncTransformerSelection();
        canvas.getLayer()?.draw();
      };
      // Select on press so a drag starts already in selected state.
      node.on("mousedown touchstart", function (e) {
        if (isEditing()) return;
        if (!_canSelectObjects(state.activeTool)) return;
        e.cancelBubble = true;
        selectThis();
      });
      node.on("click tap", function (e) {
        e.cancelBubble = true;
        if (isEditing()) return;
        if (!_canSelectObjects(state.activeTool)) return;
        const now = Date.now();
        if (now - (_lastClickAt[lay.id] || 0) < 350) {
          delete _lastClickAt[lay.id];
          startEdit(lay.id);
          canvas.expandLayer(lay.id);
          return;
        }
        _lastClickAt[lay.id] = now;
        selectThis();
      });
      node.on("dragstart", function () {
        selectThis();
      });
      node.on("dragend", function () {
        // x/y is local top-left (same model as Transformer).
        const img = stageToImg(node.x(), node.y());
        const target = page.layers.find(function (l) {
          return l.id === (node.getAttr("layerId") as string);
        });
        if (target) {
          target.bbox.x = img.x;
          target.bbox.y = img.y;
          history.snapshot();
        }
        sidebar.render();
      });
      // Bake scale into the box rect during drag so glyphs don't stretch.
      node.on("transform", function () {
        const sx = node.scaleX();
        const sy = node.scaleY();
        if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return;
        const box = node.findOne<Konva.Rect>(".layer-text-box");
        if (!box) return;
        const newW = Math.max(4, Math.abs(box.width() * sx));
        const newH = Math.max(4, Math.abs(box.height() * sy));
        node.scaleX(1);
        node.scaleY(1);
        box.width(newW);
        box.height(newH);
        // Vertical = multi-column glyphs; stretching the first column to the
        // full box warps layout. Only resize the box live — columns rebuild
        // on transformend via render.
        if (lay.typography.direction === "vertical") {
          node.getChildren().forEach(function (c) {
            const n = c.name();
            if (n === "layer-text-glyphs" || n === "layer-text-glyphs-col") {
              c.visible(false);
            }
          });
          return;
        }
        const glyphs = node.findOne<Konva.Text>(".layer-text-glyphs");
        if (glyphs) {
          glyphs.width(newW);
          glyphs.height(newH);
        }
      });
      node.on("transformend", function () {
        onNodeTransformEnd(node);
        // Box was resized with the transformer while editing — onNodeTransformEnd()
        // full-renders, so re-hide the fresh node's glyphs, keep the handles
        // attached and move the textarea to the new box.
        if (getEditingLayerId() === lay.id) {
          refreshEditingState();
          const ta = getEditor();
          if (ta) {
            ta.focus();
            const len = ta.value.length;
            ta.setSelectionRange(len, len);
          }
        }
      });
      konvaLayer.add(node);
      layerTextNodes.push(node);
    });

  syncTransformerSelection();
  konvaLayer.draw();
  // Full render (zoom/pan) while editing must not show the committed text
  // as a "shadow" under the textarea — re-hide glyphs + re-sync the editor.
  refreshEditingState();
}
