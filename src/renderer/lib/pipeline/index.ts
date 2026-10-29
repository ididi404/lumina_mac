/** Lumina Pipeline — Facade */
import { detection } from "./detection";
import { ocr } from "./ocr";
import { translate } from "./translate";
import { inpaint } from "./inpaint";

/* ── Pipeline Presets ── */

export type PresetId = "full" | "clean";

export interface PresetDef {
  id: PresetId;
  /** i18n key for the preset label */
  labelKey: string;
}

export const PRESETS: PresetDef[] = [
  { id: "full", labelKey: "pipeline.presetFull" },
  { id: "clean", labelKey: "pipeline.presetClean" },
];

const PRESET_KEY = "lumina-pipeline-preset";

/** Load saved preset (default: full). */
export function loadPreset(): PresetId {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw === "clean") return "clean";
  } catch {
    /* ignore */
  }
  return "full";
}

/** Persist preset selection. */
export function savePreset(id: PresetId): void {
  try {
    localStorage.setItem(PRESET_KEY, id);
  } catch {
    /* ignore */
  }
}

export const pipeline = {
  runDetection: detection.run,
  runDetectionAll: detection.runAll,
  /** Standalone OCR / Translate / Inpaint — selected box only when highlighted. */
  runOcr: () => ocr.run({ onlySelected: true }),
  runTranslate: () => translate.run({ onlySelected: true }),
  runInpaint: () => inpaint.run({ onlySelected: true }),
  async runAll(): Promise<void> {
    await detection.run();
    await ocr.run();
    await translate.run();
    await inpaint.run(); // full page — ignore selection
  },
  /** Run the given preset by id. */
  async runPreset(id: PresetId): Promise<void> {
    if (id === "clean") {
      await detection.run();
      await inpaint.run(); // full page
    } else {
      // "full"
      await detection.run();
      await ocr.run();
      await translate.run();
      await inpaint.run(); // full page
    }
  },
};
