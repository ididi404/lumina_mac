/** Lumina i18n — localization loaded from JSON via IPC */

type TranslationData = Record<string, Record<string, string>>;

function _initialLang(): string {
  const saved = localStorage.getItem("lumina-lang");
  // Bahasa Indonesia removed — migrate leftover preference to Simplified Chinese.
  if (saved === "id") return "zh";
  if (saved === "en" || saved === "zh") return saved;
  return "zh";
}

let _lang: string = _initialLang();
let _data: TranslationData = {};

function _interpolate(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : "{{" + k + "}}",
  );
}

export function t(key: string, params?: Record<string, unknown>): string {
  let val = _data[_lang] && _data[_lang][key];
  if (val === undefined && _lang !== "en") val = _data.en && _data.en[key];
  if (val === undefined) return key;
  return _interpolate(val, params);
}

export function lang(): string {
  return _lang;
}

function _syncMainLang(code: string): void {
  try {
    void window.lumina?.setUiLang?.(code);
  } catch {
    /* preload not ready */
  }
}

export function setLang(code: string): void {
  if (code === _lang) return;
  _lang = code;
  localStorage.setItem("lumina-lang", code);
  document.documentElement.lang = code;
  _syncMainLang(code);
  _renderAll();
}

function _renderAll(): void {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n") as string);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title") as string);
  });
  document
    .querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >("[data-i18n-placeholder]")
    .forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder") as string);
    });
  document.title = t("app.title");
}

/** Load all translation JSONs via IPC, then init */
export function init(): Promise<void> {
  return window.lumina
    .loadTranslations()
    .then((data) => {
      _data = data || {};
      document.documentElement.lang = _lang;
      _syncMainLang(_lang);
      _renderAll();
    })
    .catch(() => {
      // fallback: t() returns key
    });
}
