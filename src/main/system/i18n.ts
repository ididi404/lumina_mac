/** Main-process i18n — same JSON catalogs as the renderer; lang from config. */
import fs from "fs";
import path from "path";
import { MAIN_DIR } from "../core/paths";
import { log } from "../core/logger";
import { readConfig } from "./config";

type Catalog = Record<string, Record<string, string>>;

let _data: Catalog | null = null;

function loadAll(): Catalog {
  if (_data) return _data;
  const dir = path.join(MAIN_DIR, "../renderer/i18n");
  const out: Catalog = {};
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      out[name.replace(".json", "")] = JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf-8"),
      );
    }
  } catch (err) {
    log.error(`Failed to load translations: ${err}`);
  }
  _data = out;
  return out;
}

function interpolate(
  str: string,
  params?: Record<string, unknown>,
): string {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : "{{" + k + "}}",
  );
}

/** Resolve UI language for native dialogs (default zh). */
export function uiLang(): "en" | "zh" {
  return readConfig().uiLang === "en" ? "en" : "zh";
}

export function t(key: string, params?: Record<string, unknown>): string {
  const data = loadAll();
  const lang = uiLang();
  let val = data[lang]?.[key];
  if (val === undefined && lang !== "en") val = data.en?.[key];
  if (val === undefined) return key;
  return interpolate(val, params);
}
