/* ── Settings: Translation tab (provider, target lang, instruction) ──
 * Provider list comes from shared/translate-providers.ts — do not hardcode.
 */
import * as i18n from "../i18n";
import { createIcons } from "../ui/icons";
import { translateSettings, type TranslateConfig } from "../pipeline/translate";
import {
  TRANSLATE_PROVIDERS,
  OPENAI_PRESET_PROVIDERS,
  providerById,
  type TranslateModelOption,
} from "../../../shared/translate-providers";

const API_KEY_TUTORIAL =
  "https://lumina.navierr.dev/docs/guides/translation#how-to-get-your-api-key";

/** Preset target languages shown in the settings select. */
const TARGET_LANGS = [
  "zh",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "vi",
  "th",
  "id",
  "fr",
  "de",
  "es",
  "ru",
  "pt",
] as const;

function card(): HTMLElement {
  const c = document.createElement("div");
  c.className = "settings-section";
  return c;
}

function presetRowsId(id: string): string {
  return `tr-preset-rows-${id}`;
}

function keyInputId(field: string): string {
  return `tr-key-${field}`;
}

function modelInputId(field: string): string {
  return `tr-model-${field}`;
}

export const translationTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

    const help = card();
    const helpTitle = document.createElement("div");
    helpTitle.className = "settings-section-title";
    helpTitle.textContent = i18n.t("settings.trNoKeyTitle");
    help.appendChild(helpTitle);
    const helpText = document.createElement("p");
    helpText.className =
      "text-[0.72rem] text-text-muted leading-relaxed max-w-[52ch]";
    helpText.textContent = i18n.t("settings.trNoKeyHint");
    help.appendChild(helpText);
    const helpLink = document.createElement("a");
    helpLink.className =
      "group inline-flex items-center gap-1.5 mt-3 pt-2.5 border-t border-white/5 text-[0.72rem] font-medium text-lumina hover:text-lumina-dark w-fit";
    helpLink.href = API_KEY_TUTORIAL;
    helpLink.target = "_blank";
    helpLink.rel = "noreferrer";
    const linkIcon = document.createElement("i");
    linkIcon.dataset.lucide = "external-link";
    linkIcon.className =
      "w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-px";
    helpLink.appendChild(linkIcon);
    const linkText = document.createElement("span");
    linkText.textContent = i18n.t("settings.trNoKeyLink");
    helpLink.appendChild(linkText);
    help.appendChild(helpLink);
    pane.appendChild(help);

    const general = card();
    general.appendChild(
      this._row(i18n.t("settings.trProvider"), (row) => {
        const sel = document.createElement("select");
        sel.id = "tr-provider";
        sel.className = "field-select";
        for (const p of TRANSLATE_PROVIDERS) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = i18n.t(p.labelKey) || p.label;
          sel.appendChild(opt);
        }
        row.appendChild(sel);
        return sel;
      }),
    );

    general.appendChild(
      this._row(i18n.t("settings.trTargetLang"), (row) => {
        const wrap = document.createElement("div");
        wrap.className = "flex items-center gap-1.5";
        const sel = document.createElement("select");
        sel.id = "tr-target-lang";
        sel.className = "field-select min-w-[9rem]";
        for (const code of TARGET_LANGS) {
          const opt = document.createElement("option");
          opt.value = code;
          opt.textContent = i18n.t("settings.lang." + code) || code;
          sel.appendChild(opt);
        }
        const customOpt = document.createElement("option");
        customOpt.value = "__custom__";
        customOpt.textContent = i18n.t("settings.trLangCustom");
        sel.appendChild(customOpt);
        const custom = document.createElement("input");
        custom.id = "tr-target-lang-custom";
        custom.type = "text";
        custom.placeholder = "zh";
        custom.className =
          "hidden w-20 px-2 py-1 text-center bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
        sel.addEventListener("change", () => {
          const isCustom = sel.value === "__custom__";
          custom.classList.toggle("hidden", !isCustom);
          if (isCustom) custom.focus();
        });
        wrap.appendChild(sel);
        wrap.appendChild(custom);
        row.appendChild(wrap);
        return wrap;
      }),
    );
    pane.appendChild(general);

    // LLM options host (custom + openai-presets)
    const llmOpts = document.createElement("div");
    llmOpts.id = "tr-llm-options";
    llmOpts.className = "settings-section hidden flex flex-col gap-3";

    // Custom provider rows
    const customRows = document.createElement("div");
    customRows.id = "tr-llm-custom-rows";
    customRows.className = "hidden flex flex-col gap-3";
    customRows.appendChild(
      this._row(i18n.t("settings.trLlmStyle"), (row) => {
        const sel = document.createElement("select");
        sel.id = "tr-llm-style";
        sel.className = "field-select";
        for (const [value, label] of [
          ["openai", i18n.t("settings.trStyleOpenai")],
          ["anthropic", i18n.t("settings.trStyleAnthropic")],
        ] as const) {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = label;
          sel.appendChild(opt);
        }
        row.appendChild(sel);
        return sel;
      }),
    );
    customRows.appendChild(
      this._field(
        "tr-llm-url",
        "text",
        i18n.t("settings.trLlmUrl"),
        "https://api.openai.com/v1",
      ),
    );
    customRows.appendChild(
      this._keyField("tr-key-llmApiKey", i18n.t("settings.trLlmKey"), "sk-..."),
    );
    customRows.appendChild(
      this._field(
        "tr-model-llmModel",
        "text",
        i18n.t("settings.trLlmModel"),
        "gpt-4o-mini",
      ),
    );
    llmOpts.appendChild(customRows);

    // One block per OpenAI-compatible preset (from catalog)
    for (const p of OPENAI_PRESET_PROVIDERS) {
      const rows = document.createElement("div");
      rows.id = presetRowsId(p.id);
      rows.className = "hidden flex flex-col gap-3";
      rows.appendChild(
        this._keyField(
          keyInputId(p.apiKeyField!),
          i18n.t("settings.trApiKeyNamed", { name: i18n.t(p.labelKey) }),
          p.keyPlaceholder || "",
        ),
      );
      rows.appendChild(
        this._modelSelect(
          modelInputId(p.modelField!),
          i18n.t("settings.trLlmModel"),
          p.models || [],
          p.defaultModel || "",
        ),
      );
      llmOpts.appendChild(rows);
    }
    pane.appendChild(llmOpts);

    // Gemini
    const gemini = providerById("gemini")!;
    const geminiOpts = document.createElement("div");
    geminiOpts.id = "tr-gemini-options";
    geminiOpts.className = "settings-section hidden flex flex-col gap-3";
    geminiOpts.appendChild(
      this._keyField(
        keyInputId("geminiApiKey"),
        i18n.t("settings.trGeminiKey"),
        "",
      ),
    );
    geminiOpts.appendChild(
      this._modelSelect(
        modelInputId("geminiModel"),
        i18n.t("settings.trGeminiModel"),
        gemini.models || [],
        gemini.defaultModel || "gemini-3.5-flash-lite",
      ),
    );
    pane.appendChild(geminiOpts);

    // System instruction
    const instrCard = card();
    const instrWrap = document.createElement("div");
    const instrLabel = document.createElement("div");
    instrLabel.className = "field-label";
    instrLabel.dataset.i18n = "settings.trLlmInstruction";
    instrLabel.textContent = i18n.t("settings.trLlmInstruction");
    instrWrap.appendChild(instrLabel);

    const instr = document.createElement("textarea");
    instr.id = "tr-instruction";
    instr.rows = 8;
    instr.placeholder = i18n.t("settings.trInstructionPlaceholder");
    instr.className =
      "w-full mt-1 px-2 py-1 bg-surface-3 border border-surface-3 rounded text-[0.72rem] leading-relaxed text-text-primary outline-none resize-y focus:border-accent";
    instrWrap.appendChild(instr);

    const btnRow = document.createElement("div");
    btnRow.className = "flex gap-1 mt-1";
    const loadBtn = document.createElement("button");
    loadBtn.id = "tr-instruction-load";
    loadBtn.className = "btn text-[0.68rem]";
    loadBtn.textContent = i18n.t("settings.trLoadInstruction");
    btnRow.appendChild(loadBtn);
    instrWrap.appendChild(btnRow);
    instrCard.appendChild(instrWrap);
    pane.appendChild(instrCard);

    const providerSel = pane.querySelector<HTMLSelectElement>("#tr-provider")!;
    const persist = () => this._persist(pane);

    providerSel.addEventListener("change", function () {
      translationTab._syncVisibility(pane);
      persist();
    });
    const styleSel = pane.querySelector<HTMLSelectElement>("#tr-llm-style");
    styleSel?.addEventListener("change", function () {
      translationTab._syncStylePlaceholders(pane);
      persist();
    });
    [general, llmOpts, geminiOpts].forEach((root) => {
      root
        .querySelectorAll("input, select")
        .forEach((el) => el.addEventListener("input", persist));
      root
        .querySelectorAll("input, select")
        .forEach((el) => el.addEventListener("change", persist));
    });
    instr.addEventListener("blur", persist);

    loadBtn.addEventListener("click", function () {
      window.lumina
        .loadDefaultInstruction()
        .then(function (text) {
          instr.value = text;
          persist();
        })
        .catch(function () {});
    });

    this._applyLocal(pane);
    this.refresh();
  },

  commit(): void {
    const pane = document.getElementById("tab-translation");
    if (pane) this._persist(pane);
  },

  _applyLocal(pane: HTMLElement): void {
    const cfg = translateSettings.load();
    const providerSel = pane.querySelector<HTMLSelectElement>("#tr-provider");
    if (providerSel) providerSel.value = cfg.provider;
    this._applyTargetLang(pane, cfg.targetLang || "zh");
    const set = (id: string, v: string) => {
      const el = pane.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "#" + id,
      );
      if (el && document.activeElement !== el) el.value = v;
    };
    set("tr-instruction", cfg.llmInstruction || "");
    set("tr-llm-url", cfg.llmBaseUrl || "");
    const styleSel = pane.querySelector<HTMLSelectElement>("#tr-llm-style");
    if (styleSel) styleSel.value = cfg.llmStyle || "openai";
    this._syncStylePlaceholders(pane);

    for (const p of TRANSLATE_PROVIDERS) {
      if (p.modelField) {
        this._applyModel(
          pane,
          p.modelField,
          cfg[p.modelField] || p.defaultModel || "",
          p.models || [],
          p.defaultModel || "",
        );
      }
    }
    this._syncVisibility(pane);
  },

  async refresh(): Promise<void> {
    const pane = document.getElementById("tab-translation");
    if (!pane) return;
    const before = this._keySnapshot(pane);
    const cfg = await translateSettings.loadWithSecrets();
    if (this._keySnapshot(pane) !== before) return;
    const set = (id: string, v: string) => {
      const el = pane.querySelector<HTMLInputElement>("#" + id);
      if (el && document.activeElement !== el) el.value = v;
    };
    for (const p of TRANSLATE_PROVIDERS) {
      if (p.apiKeyField) {
        set(keyInputId(p.apiKeyField), cfg[p.apiKeyField] || "");
      }
    }
  },

  _keySnapshot(pane: HTMLElement): string {
    return TRANSLATE_PROVIDERS.map((p) =>
      p.apiKeyField
        ? (pane.querySelector<HTMLInputElement>(
            "#" + keyInputId(p.apiKeyField),
          )?.value ?? "")
        : "",
    ).join("\u0000");
  },

  _syncStylePlaceholders(pane: HTMLElement): void {
    const style =
      pane.querySelector<HTMLSelectElement>("#tr-llm-style")?.value ?? "openai";
    const url = pane.querySelector<HTMLInputElement>("#tr-llm-url");
    const model = pane.querySelector<HTMLInputElement>("#tr-model-llmModel");
    if (url)
      url.placeholder =
        style === "anthropic"
          ? "https://api.anthropic.com"
          : "https://api.openai.com/v1";
    if (model)
      model.placeholder =
        style === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o-mini";
  },

  _syncVisibility(pane: HTMLElement): void {
    const provider =
      pane.querySelector<HTMLSelectElement>("#tr-provider")?.value ?? "";
    const def = providerById(provider);
    const llm = pane.querySelector<HTMLElement>("#tr-llm-options");
    const gemini = pane.querySelector<HTMLElement>("#tr-gemini-options");
    const customRows = pane.querySelector<HTMLElement>("#tr-llm-custom-rows");

    if (llm) llm.classList.toggle("hidden", def?.kind === "gemini");
    if (gemini) gemini.classList.toggle("hidden", def?.kind !== "gemini");
    if (customRows)
      customRows.classList.toggle("hidden", def?.kind !== "custom");

    for (const p of OPENAI_PRESET_PROVIDERS) {
      const rows = pane.querySelector<HTMLElement>("#" + presetRowsId(p.id));
      if (rows) rows.classList.toggle("hidden", provider !== p.id);
    }
  },

  /** Hydrate target-lang select (+ optional custom input). */
  _applyTargetLang(pane: HTMLElement, code: string): void {
    const sel = pane.querySelector<HTMLSelectElement>("#tr-target-lang");
    const custom = pane.querySelector<HTMLInputElement>("#tr-target-lang-custom");
    if (!sel) return;
    const normalized = code.trim() || "zh";
    const known = TARGET_LANGS.includes(
      normalized as (typeof TARGET_LANGS)[number],
    );
    if (known) {
      sel.value = normalized;
      if (custom) {
        custom.value = "";
        custom.classList.add("hidden");
      }
    } else {
      sel.value = "__custom__";
      if (custom) {
        custom.value = normalized;
        custom.classList.remove("hidden");
      }
    }
  },

  _readTargetLang(pane: HTMLElement): string {
    const sel = pane.querySelector<HTMLSelectElement>("#tr-target-lang");
    const custom = pane.querySelector<HTMLInputElement>("#tr-target-lang-custom");
    if (!sel) return "zh";
    if (sel.value === "__custom__") {
      return (custom?.value.trim() || "zh").toLowerCase();
    }
    return (sel.value || "zh").toLowerCase();
  },

  _persist(pane: HTMLElement): void {
    const val = (id: string) =>
      pane
        .querySelector<HTMLInputElement | HTMLTextAreaElement>("#" + id)
        ?.value.trim() ?? "";

    const provider =
      pane.querySelector<HTMLSelectElement>("#tr-provider")?.value ?? "gemini";
    const cfg: TranslateConfig = {
      provider,
      targetLang: this._readTargetLang(pane),
      llmBaseUrl: val("tr-llm-url"),
      llmStyle:
        pane.querySelector<HTMLSelectElement>("#tr-llm-style")?.value ===
        "anthropic"
          ? "anthropic"
          : "openai",
      llmInstruction: (
        pane.querySelector<HTMLTextAreaElement>("#tr-instruction")?.value ?? ""
      ).trim(),
    };

    for (const p of TRANSLATE_PROVIDERS) {
      if (p.apiKeyField) {
        cfg[p.apiKeyField] = val(keyInputId(p.apiKeyField));
      }
      if (p.modelField) {
        cfg[p.modelField] = this._readModel(
          pane,
          p.modelField,
          p.defaultModel || "",
        );
      }
    }

    translateSettings.save(cfg);
  },

  /** Model dropdown (+ optional custom id) for curated providers. */
  _modelSelect(
    id: string,
    labelText: string,
    models: TranslateModelOption[],
    defaultModel: string,
  ): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);

    const box = document.createElement("div");
    box.className = "flex flex-col gap-1.5 mt-1";

    const sel = document.createElement("select");
    sel.id = id;
    sel.className = "field-select w-full";
    const freeTag = i18n.t("settings.trModelFree");
    for (const m of models) {
      const opt = document.createElement("option");
      opt.value = m.id;
      const name = m.label || m.id;
      opt.textContent = m.free ? `${name} · ${freeTag}` : name;
      sel.appendChild(opt);
    }
    const customOpt = document.createElement("option");
    customOpt.value = "__custom__";
    customOpt.textContent = i18n.t("settings.trLangCustom");
    sel.appendChild(customOpt);

    const custom = document.createElement("input");
    custom.id = id + "-custom";
    custom.type = "text";
    custom.placeholder = defaultModel;
    custom.className =
      "hidden w-full px-2 py-1 bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";

    sel.addEventListener("change", () => {
      const isCustom = sel.value === "__custom__";
      custom.classList.toggle("hidden", !isCustom);
      if (isCustom) custom.focus();
    });

    if (defaultModel && models.some((m) => m.id === defaultModel)) {
      sel.value = defaultModel;
    }

    box.appendChild(sel);
    box.appendChild(custom);
    wrap.appendChild(box);
    return wrap;
  },

  _applyModel(
    pane: HTMLElement,
    field: string,
    value: string,
    options: TranslateModelOption[],
    defaultModel: string,
  ): void {
    const id = modelInputId(field);
    const sel = pane.querySelector<HTMLSelectElement | HTMLInputElement>(
      "#" + id,
    );
    const custom = pane.querySelector<HTMLInputElement>("#" + id + "-custom");
    if (!sel) return;

    if (sel.tagName !== "SELECT") {
      if (document.activeElement !== sel) {
        (sel as HTMLInputElement).value = value;
      }
      return;
    }

    const select = sel as HTMLSelectElement;
    const known = options.some((o) => o.id === value);
    if (known) {
      select.value = value;
      if (custom) {
        custom.value = "";
        custom.classList.add("hidden");
      }
      return;
    }
    if (value) {
      select.value = "__custom__";
      if (custom) {
        custom.value = value;
        custom.classList.remove("hidden");
      }
      return;
    }
    select.value = defaultModel || options[0]?.id || "";
    if (custom) custom.classList.add("hidden");
  },

  _readModel(
    pane: HTMLElement,
    field: string,
    defaultModel: string,
  ): string {
    const id = modelInputId(field);
    const sel = pane.querySelector<HTMLSelectElement | HTMLInputElement>(
      "#" + id,
    );
    const custom = pane.querySelector<HTMLInputElement>("#" + id + "-custom");
    if (!sel) return defaultModel;
    if (sel.tagName !== "SELECT") {
      return (sel as HTMLInputElement).value.trim() || defaultModel;
    }
    const select = sel as HTMLSelectElement;
    if (select.value === "__custom__") {
      return custom?.value.trim() || defaultModel;
    }
    return select.value || defaultModel;
  },

  _row(labelText: string, fn: (row: HTMLElement) => HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "field-row items-center justify-between mb-3";
    const label = document.createElement("span");
    label.className = "text-[0.78rem] text-text-primary";
    label.textContent = labelText;
    row.appendChild(label);
    const control = fn(row);
    row.appendChild(control);
    return row;
  },

  _field(
    id: string,
    type: string,
    labelText: string,
    placeholder: string,
  ): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    const input = document.createElement("input");
    input.type = type;
    input.id = id;
    input.className =
      "w-full mt-1 px-2 py-1 bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
    if (placeholder) input.placeholder = placeholder;
    wrap.appendChild(input);
    return wrap;
  },

  _keyField(id: string, labelText: string, placeholder: string): HTMLElement {
    const wrap = document.createElement("div");
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    const box = document.createElement("div");
    box.className = "relative mt-1";
    const input = document.createElement("input");
    input.type = "password";
    input.id = id;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className =
      "w-full px-2 py-1 pr-8 bg-surface-3 border border-surface-3 rounded text-[0.78rem] text-text-primary outline-none focus:border-accent";
    if (placeholder) input.placeholder = placeholder;
    box.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-secondary hover:text-text-primary";
    btn.setAttribute("aria-label", i18n.t("settings.trToggleKey"));
    btn.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
    btn.addEventListener("click", function () {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show
        ? '<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>'
        : '<i data-lucide="eye" class="w-3.5 h-3.5"></i>';
      createIcons({ nameAttr: "data-lucide", root: btn });
    });
    box.appendChild(btn);
    wrap.appendChild(box);
    return wrap;
  },
};
