/** Select action — convert selection(s) to text detection. */
import { state } from "../../../../state";
import { history } from "../../../../history";
import { canvas } from "../../../index";
import { sidebar } from "../../../../sidebar";
import { log } from "../../../../logger";
import { defaultTypography, loadGlobalTypography } from "../../../../../types";
import type { PageLayer, TextDetection } from "../../../../../types";
import { selections, clearSelections, shapeAABB, isHoleShape } from "../shared";
import { refreshOverlay } from "../render";
import { hideContextBar } from "../context-bar";

interface TextStyleRow {
  index: number;
  color?: string | null;
  angle?: number | null;
}

export async function toDetection(): Promise<void> {
  const page = state.getActivePage();
  if (!page) return;
  const selList = selections.slice();
  if (!selList.length) return;

  const dialogueCount = page.layers.filter(function (l) {
    return l.type === "text-dialogue";
  }).length;

  const newIds: string[] = [];
  const newDetIndices: number[] = [];
  selList.forEach(function (s) {
    // Merged (Shift) or carved (Alt) selections hold several pieces —
    // convert each piece to its own detection so one box lands per bubble.
    s.shapes.forEach(function (shape) {
      // Hole loops (a carved-out region fully inside another piece) render
      // as an inner outline but must NOT become their own detection.
      if (isHoleShape(s.shapes, shape)) return;
      const bbox = shapeAABB(shape);
      const x = Math.max(0, Math.round(bbox.x));
      const y = Math.max(0, Math.round(bbox.y));
      const x2 = Math.min(page.naturalWidth, Math.round(bbox.x + bbox.w));
      const y2 = Math.min(page.naturalHeight, Math.round(bbox.y + bbox.h));
      if (x2 - x < 6 || y2 - y < 6) return; // too small to be useful

      const idx = page.textDetections.length;
      const id = "text-manual-" + Date.now() + "-" + idx;
      const det: TextDetection = {
        id: id,
        bbox: { x: x, y: y, w: x2 - x, h: y2 - y },
        confidence: 0,
        status: "adjusted",
        type: "text_free",
      };
      // Append after existing detections — do NOT re-sort by reading order.
      // Auto-detect already sorted once; manual boxes should become T(n+1)…
      page.textDetections.push(det);

      // Insert the mirrored dialogue layer right after the existing dialogue
      // block (before free-text layers), keeping layers[i] === detections[i]
      // for all i — the invariant ocr.ts relies on.
      const insertAt = dialogueCount + newIds.length;
      const layer: PageLayer = {
        id: "layer-dialogue-" + Date.now() + "-" + idx,
        type: "text-dialogue",
        bbox: { x: x, y: y, w: x2 - x, h: y2 - y },
        source: "",
        translation: "",
        typography: Object.assign(
          defaultTypography(),
          loadGlobalTypography(),
          { fontSize: null, align: "center" },
        ),
        visible: true,
        opacity: 1,
      };
      page.layers.splice(insertAt, 0, layer);

      newIds.push(id);
      newDetIndices.push(idx);
    });
  });

  if (!newIds.length) return;

  // Same color sampler as /detect — manual boxes previously skipped this.
  try {
    const result = await window.lumina.apiPost<{
      styles?: TextStyleRow[];
      detail?: string;
    }>("/text-styles", {
      imagePath: page.filePath,
      boxes: newDetIndices.map(function (i) {
        return page.textDetections[i].bbox;
      }),
    });
    (result?.styles || []).forEach(function (style) {
      const detIdx = newDetIndices[style.index];
      if (detIdx == null) return;
      const det = page.textDetections[detIdx];
      const layer = page.layers[detIdx];
      if (!det || !layer || layer.type !== "text-dialogue") return;
      if (style.color) {
        det.textColor = style.color;
        layer.typography.color = style.color;
      }
      if (style.angle != null) det.textAngle = style.angle;
    });
  } catch (err) {
    log.warn("fe", `text-styles after manual detect failed: ${err}`);
  }

  const firstNewId = newIds[0];
  page._selectedTextIdx = page.textDetections.findIndex(function (d) {
    return d.id === firstNewId;
  });
  page._selectedLayerId =
    page._selectedTextIdx < 0
      ? null
      : (page.layers[page._selectedTextIdx]?.id ?? null);
  if (page._selectedTextIdx < 0) page._selectedTextIdx = null;
  state.showDetBoxes = true; // fresh boxes must be visible
  canvas.render();
  sidebar.render();
  history.snapshot();

  // Selection is transient: clear the marquee after conversion. Stay on the
  // current tool (rect/lasso) — boxes are selectable/draggable there too.
  clearSelections();
  refreshOverlay();
  hideContextBar();
  if (page._selectedTextIdx != null) {
    canvas.selectTextDetection(page._selectedTextIdx);
  }
}
