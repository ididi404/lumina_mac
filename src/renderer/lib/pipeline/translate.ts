/* ── Lumina Translation settings + pipeline ──
 * Non-secret config persisted in localStorage; API keys stored encrypted
 * via safeStorage vault (main/storage.ts) and injected per-request.
 */
import { state } from "../state";
import * as i18n from "../i18n";
import { ui } from "../ui";
import { history } from "../history";
import { canvas } from "../canvas/index";
import { sidebar } from "../sidebar";
import { normalizeAutoText } from "./text-norm";
import { revealTypesetLayers } from "./reveal-text";
import type { TextDetection } from "../../types";
import { log } from "../logger";
import {
  TRANSLATE_PROVIDERS,
  allApiKeyFields,
  providerById,
} from "../../../shared/translate-providers";

const STORAGE_KEY = "lumina-translate";

const API_KEY_FIELDS = allApiKeyFields();

/** localStorage holds everything EXCEPT the api keys (those live in the vault) */
type StoredConfig = Omit<TranslateConfig, (typeof API_KEY_FIELDS)[number]>;

/** Flat config — provider-specific key/model fields come from the catalog. */
export type TranslateConfig = {
  provider: string;
  targetLang: string;
  llmBaseUrl: string;
  llmStyle: "openai" | "anthropic";
  llmInstruction: string;
} & Record<string, string>;

function defaultConfig(): TranslateConfig {
  const cfg: TranslateConfig = {
    provider: "gemini",
    targetLang: "zh",
    llmBaseUrl: "",
    llmApiKey: "",
    llmModel: "gpt-4o-mini",
    llmStyle: "openai",
    llmInstruction: "",
  };
  for (const p of TRANSLATE_PROVIDERS) {
    if (p.apiKeyField) cfg[p.apiKeyField] = "";
    if (p.modelField && p.defaultModel) cfg[p.modelField] = p.defaultModel;
  }
  return cfg;
}

export const translateSettings = {
  load(): TranslateConfig {
    let cfg: TranslateConfig = defaultConfig();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) cfg = { ...cfg, ...(JSON.parse(raw) as StoredConfig) };
    } catch {
      /* keep defaults */
    }
    return cfg;
  },

  /**
   * Persist non-secret fields to localStorage + keys to the vault.
   * Empty key values do NOT overwrite existing vault entries.
   */
  save(cfg: TranslateConfig): void {
    const stored: Record<string, string> = {
      provider: cfg.provider,
      targetLang: cfg.targetLang,
      llmBaseUrl: cfg.llmBaseUrl,
      llmStyle: cfg.llmStyle,
      llmInstruction: cfg.llmInstruction,
    };
    for (const p of TRANSLATE_PROVIDERS) {
      if (p.modelField && cfg[p.modelField] != null) {
        stored[p.modelField] = cfg[p.modelField];
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    if (window.lumina.setSecret) {
      for (const field of API_KEY_FIELDS) {
        const val = cfg[field];
        if (val) window.lumina.setSecret(field, val);
      }
      log.debug(
        "fe",
        `secrets save: provider=${cfg.provider} keys=${API_KEY_FIELDS.filter((f) => !!cfg[f]).join(",") || "none"}`,
      );
    } else {
      log.warn(
        "fe",
        "window.lumina.setSecret MISSING — preload not rebuilt? Keys NOT saved",
      );
    }
  },

  async clearKey(name: string): Promise<void> {
    if (window.lumina.deleteSecret) await window.lumina.deleteSecret(name);
  },

  /** Full config incl. api keys — call before POST /translate */
  async loadWithSecrets(): Promise<TranslateConfig> {
    const cfg = this.load();
    const def = providerById(cfg.provider);
    const vaultKey = def?.apiKeyField;
    if (vaultKey && window.lumina.getSecrets) {
      try {
        const secrets = await window.lumina.getSecrets([vaultKey]);
        const val = secrets[vaultKey] || "";
        cfg[vaultKey] = val;
        log.debug(
          "fe",
          `secrets load: provider=${cfg.provider} ${vaultKey}=${val ? "set" : "empty"}`,
        );
      } catch {
        /* vault unavailable — proceed with empty keys */
      }
    }
    return cfg;
  },
};

export const translate = {
  /**
   * Translate text detections of the active page.
   * Standalone Translate button: `{ onlySelected: true }` limits to the
   * highlighted box when one is selected; otherwise all boxes with OCR text.
   */
  run: async function (opts?: { onlySelected?: boolean }): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    const selIdx = page._selectedTextIdx;
    const selective =
      !!opts?.onlySelected &&
      selIdx !== null &&
      selIdx >= 0 &&
      selIdx < page.textDetections.length;
    const candidates = selective
      ? [page.textDetections[selIdx]]
      : page.textDetections;
    const withText = candidates.filter(function (d) {
      return (d.text || "").trim().length > 0;
    });
    if (!withText.length) {
      ui.toast(i18n.t("toast.trNoText"), "warn");
      return;
    }
    state.isRunning = true;

    const loadingToast = ui.toast(
      i18n.t("toast.trRunning", { count: withText.length }),
      "running",
      0,
    );

    try {
      const config = await translateSettings.loadWithSecrets();
      log.debug(
        "fe",
        `translate: start provider=${config.provider} texts=${withText.length} lang=${config.targetLang}`,
      );
      const result = await window.lumina.apiPost<{
        results?: Array<{ index: number; text: string }>;
        detail?: string;
      }>("/translate", {
        texts: withText.map(function (d) {
          return d.text;
        }),
        previousLines: (function () {
          const ctx: string[] = [];
          const acc: string[] = [];
          withText.forEach(function (d) {
            ctx.push(acc.join(" / "));
            acc.push(d.translated || d.text || "");
          });
          return ctx;
        })(),
        types: withText.map(function (d) {
          return d.type || "";
        }),
        config: config,
      });
      if (!result || !result.results)
        throw new Error(result?.detail || "Translation failed");

      log.debug(
        "fe",
        `translate: done ${(result.results || []).length} result(s)`,
      );

      withText.forEach(function (det: TextDetection, i: number) {
        const r = (result.results || []).find(function (x) {
          return x.index === i;
        });
        if (!r) return;
        det.translated = normalizeAutoText(r.text || "") || det.text || "";
        const detIdx = page.textDetections.indexOf(det);
        const layer = page.layers[detIdx];
        if (layer && layer.type === "text-dialogue")
          layer.translation = det.translated;
      });

      // Hand canvas to typeset text boxes (pipeline does this after inpaint).
      revealTypesetLayers();
      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(
        i18n.t("toast.trDone", { count: (result.results || []).length }),
        "success",
        3000,
      );
    } catch (err) {
      log.error("fe", `Translate: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.trFailed"), "error");
    } finally {
      state.isRunning = false;
    }
  },

  /** Re-translate a single layer from the layer list (per-line retranslate) */
  retranslateLayer: async function (id: string): Promise<void> {
    const page = state.getActivePage();
    if (state.isRunning || !page) return;
    const i = page.layers.findIndex(function (l) {
      return l.id === id;
    });
    if (i < 0) return;
    const layer = page.layers[i];
    const text = (layer.source || "").trim();
    if (!text) {
      ui.toast(i18n.t("toast.trNoText"), "warn");
      return;
    }
    state.isRunning = true;

    const loadingToast = ui.toast(
      i18n.t("toast.trRunning", { count: 1 }),
      "running",
      0,
    );

    try {
      let prev: string[] = [];
      for (let k = i - 1; k >= 0; k--) {
        const p = page.layers[k];
        if (p.type === "text-dialogue") {
          prev.unshift(p.translation || p.source || "");
        }
      }

      const config = await translateSettings.loadWithSecrets();
      log.debug("fe", `retranslate layer=${id} provider=${config.provider}`);
      const result = await window.lumina.apiPost<{
        results?: Array<{ index: number; text: string }>;
        detail?: string;
      }>("/translate", {
        texts: [text],
        previousLines: [prev.join(" / ")],
        types: [layer.type === "text-dialogue" ? "text_bubble" : "text_free"],
        config: config,
      });
      if (!result || !result.results || !result.results[0])
        throw new Error(result?.detail || "Translation failed");

      const translated = normalizeAutoText(result.results[0].text || "");
      layer.translation = translated;
      if (layer.type === "text-dialogue" && i < page.textDetections.length) {
        page.textDetections[i].translated = translated;
      }

      revealTypesetLayers();
      canvas.render();
      sidebar.render();
      history.snapshot();
      ui.dismissToast(loadingToast);
      ui.toast(i18n.t("toast.trDone", { count: 1 }), "success", 3000);
    } catch (err) {
      log.error("fe", `Retranslate: ${err}`);
      ui.dismissToast(loadingToast);
      ui.toast((err as Error).message || i18n.t("toast.trFailed"), "error");
    } finally {
      state.isRunning = false;
    }
  },
};
