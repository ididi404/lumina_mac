/** Axis-aligned IoU NMS for detection boxes. */
import type { BBox } from "../../types";

function area(b: BBox): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

/** Intersection-over-union of two AABBs (0–1). */
export function bboxIou(a: BBox, b: BBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter <= 0) return 0;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Drop overlapping detections, keeping higher confidence.
 * Also drops near-duplicates where one box mostly covers the other
 * (IoA ≥ coverThresh) — common when a model emits both a tight glyph
 * box and a looser bubble box for the same text.
 */
export function nmsByIou<T extends { bbox: BBox; confidence?: number }>(
  items: T[],
  iouThresh = 0.45,
  coverThresh = 0.7,
): T[] {
  if (items.length <= 1) return items.slice();
  const sorted = items
    .slice()
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const kept: T[] = [];
  for (const cand of sorted) {
    let suppressed = false;
    for (const prev of kept) {
      const iou = bboxIou(cand.bbox, prev.bbox);
      if (iou >= iouThresh) {
        suppressed = true;
        break;
      }
      const interX0 = Math.max(cand.bbox.x, prev.bbox.x);
      const interY0 = Math.max(cand.bbox.y, prev.bbox.y);
      const interX1 = Math.min(
        cand.bbox.x + cand.bbox.w,
        prev.bbox.x + prev.bbox.w,
      );
      const interY1 = Math.min(
        cand.bbox.y + cand.bbox.h,
        prev.bbox.y + prev.bbox.h,
      );
      const inter =
        Math.max(0, interX1 - interX0) * Math.max(0, interY1 - interY0);
      const smaller = Math.min(area(cand.bbox), area(prev.bbox));
      if (smaller > 0 && inter / smaller >= coverThresh) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) kept.push(cand);
  }
  // Restore a stable top-to-bottom seed order before reading-order sort.
  return kept;
}
