/** Typography inspector — fixed-height section at top of sidebar. */
import { state } from "../state";
import * as i18n from "../i18n";
import { canvas } from "../canvas/index";
import { history } from "../history";
import { createIcons } from "../ui/icons";
import { internalFontName } from "../utils/font-loader";
import { loadGlobalTypography, saveGlobalTypography } from "../../types";
import type { Page, PageLayer, Typography } from "../../types";
import {
  getEditingLayerId,
  layerTextNodes,
  stageToImg,
} from "../canvas/tools/text/shared";
import { getTransformer } from "../canvas/tools/text/transformer";
import { syncEditorBox } from "../canvas/tools/text/editor";

/**
 * Same math as Konva.Transformer.rotateAroundCenter: keep the visual
 * center fixed while changing rotation (node x/y is local top-left).
 */
function setLayerRotationPinned(layer: PageLayer, deg: number): void {
  const node = layerTextNodes.find(function (nd) {
    return nd.getAttr("layerId") === layer.id;
  });
  const box = node ? node.findOne(".layer-text-box") : null;
  const sr = canvas.getScaleRatio();
  const w = box ? box.width() : Math.max(1, layer.bbox.w * sr);
  const h = box ? box.height() : Math.max(1, layer.bbox.h * sr);
  const oldRad =
    ((node ? node.rotation() : layer.typography.rotation) || 0) *
    (Math.PI / 180);
  const newRad = deg * (Math.PI / 180);
  if (node) {
    const x0 = node.x();
    const y0 = node.y();
    // Visual center under current rotation (Konva getCenter).
    const cx =
      x0 + (w / 2) * Math.cos(oldRad) + (h / 2) * Math.sin(-oldRad);
    const cy =
      y0 + (h / 2) * Math.cos(oldRad) + (w / 2) * Math.sin(oldRad);
    // New top-left so the center stays put at newRad.
    const x1 =
      cx - (w / 2) * Math.cos(newRad) - (h / 2) * Math.sin(-newRad);
    const y1 =
      cy - (h / 2) * Math.cos(newRad) - (w / 2) * Math.sin(newRad);
    node.rotation(deg);
    node.position({ x: x1, y: y1 });
    getTransformer()?.forceUpdate();
    node.getLayer()?.batchDraw();
    const p = stageToImg(x1, y1);
    layer.bbox.x = p.x;
    layer.bbox.y = p.y;
    if (getEditingLayerId() === layer.id) syncEditorBox();
  }
  layer.typography.rotation = deg;
  layer.bbox.rotation = deg;
}

/** Lucide icon inside an icon button. */
function lucideIcon(name: string): string {
  return '<i data-lucide="' + name + '"></i>';
}

const FONT_SIZE_PRESETS = [
  8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96,
];
const WEIGHTS = [400, 500, 600, 700, 800, 900];

const TYPE_COLLAPSED_KEY = "lumina-type-collapsed";
let _collapsed = localStorage.getItem(TYPE_COLLAPSED_KEY) === "1";

/** Global type defaults — new layers inherit these (Photoshop-style) */
let _globalType: Typography = loadGlobalTypography();

const RECENT_FONTS_KEY = "lumina:recentFonts";
const MAX_RECENT_FONTS = 5;

/** Recently used fonts (internal names, newest first) */
function loadRecentFonts(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FONTS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (v): v is string {
      return typeof v === "string";
    });
  } catch {
    return [];
  }
}

function saveRecentFonts(list: string[]): void {
  localStorage.setItem(
    RECENT_FONTS_KEY,
    JSON.stringify(list.slice(0, MAX_RECENT_FONTS)),
  );
}

/** Internal font name → display family (or the default label) */
function _fontDisplayName(internal: string | null): string {
  if (!internal) return i18n.t("type.defaultFont");
  for (const f of state.fontList || []) {
    if (internalFontName(f.family) === internal) return f.family;
  }
  return internal;
}

/** Internal font name → actual CSS font-family string */
function _fontFamilyCss(internal: string | null): string {
  if (!internal) return "";
  for (const f of state.fontList || []) {
    if (internalFontName(f.family) === internal) return f.family;
  }
  return internal;
}

// Single global document listeners (registered once at module load) — close
// open pickers/menus on outside click / Escape. Element listeners die with
// each sidebar rebuild; these module-level refs track the live menus.
let _openFontPicker: HTMLElement | null = null;
let _openFontWrap: HTMLElement | null = null;
let _openSizeWrap: HTMLElement | null = null;
{
  document.addEventListener("mousedown", function (e) {
    const t = e.target as Node;
    if (_openFontPicker && _openFontWrap && !_openFontWrap.contains(t)) {
      _openFontPicker.hidden = true;
      _openFontPicker = null;
      _openFontWrap = null;
    }
    if (_openSizeWrap && !_openSizeWrap.contains(t)) {
      document.getElementById("type-size-presets")?.remove();
      _openSizeWrap = null;
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (_openFontPicker) {
      _openFontPicker.hidden = true;
      _openFontPicker = null;
      _openFontWrap = null;
    }
    if (_openSizeWrap) {
      document.getElementById("type-size-presets")?.remove();
      _openSizeWrap = null;
    }
  });
}

// Persisted picker geometry — survives sidebar rebuilds and app restarts,
// so the user doesn't have to re-drag/resize after every font pick.
const PICKER_POS_KEY = "lumina:fontPickerPos";
const PICKER_SIZE_KEY = "lumina:fontPickerSize";
let _pickerPos: { x: number; y: number } | null = null;
let _pickerSize: { w: number; h: number } | null = null;
{
  const rawPos = localStorage.getItem(PICKER_POS_KEY);
  if (rawPos) {
    try {
      const p = JSON.parse(rawPos) as { x?: unknown; y?: unknown };
      if (typeof p.x === "number" && typeof p.y === "number")
        _pickerPos = { x: p.x, y: p.y };
    } catch {
      /* ignore */
    }
  }
  const rawSize = localStorage.getItem(PICKER_SIZE_KEY);
  if (rawSize) {
    try {
      const s = JSON.parse(rawSize) as { w?: unknown; h?: unknown };
      if (typeof s.w === "number" && typeof s.h === "number")
        _pickerSize = { w: s.w, h: s.h };
    } catch {
      /* ignore */
    }
  }
}

function selectedTextLayer(page: Page | null): PageLayer | null {
  if (!page) return null;
  // Editing counts as selected — create/resize must not leave type
  // controls dead while the in-place editor is still open.
  const id = page._selectedLayerId || getEditingLayerId();
  if (!id) return null;
  const layer = page.layers.find(function (l) {
    return l.id === id;
  });
  if (!layer) return null;
  if (layer.type === "text-dialogue" || layer.type === "text-free")
    return layer;
  return null;
}

export const typeSection = {
  isCollapsed(): boolean {
    return _collapsed;
  },

  toggleCollapsed(): void {
    _collapsed = !_collapsed;
    localStorage.setItem(TYPE_COLLAPSED_KEY, _collapsed ? "1" : "0");
  },

  /** Build DOM once; visibility toggled on each sidebar render */
  build(host: HTMLElement): void {
    host.className =
      "type-section shrink-0 border-b border-surface-3 overflow-y-auto";
    host.id = "type-section";
    host.classList.toggle("type-collapsed", _collapsed);

    // Header — clicking it collapses/expands the section (persisted)
    const header = document.createElement("div");
    header.className = "layer-header type-header";
    header.innerHTML =
      '<i data-lucide="type" class="layer-header-icon"></i>' +
      "<span>" +
      i18n.t("type.title") +
      "</span>";
    const chev = document.createElement("button");
    chev.className = "type-collapse-btn";
    chev.type = "button";
    chev.innerHTML = lucideIcon(_collapsed ? "chevron-down" : "chevron-up");
    chev.title = i18n.t(_collapsed ? "type.expand" : "type.collapse");
    header.appendChild(chev);
    host.appendChild(header);

    const body = document.createElement("div");
    body.className = "p-2 flex flex-col gap-3";
    body.id = "type-body";
    host.appendChild(body);

    // Row 1: Font + Color
    const row1 = this._grid("minmax(0,1fr) minmax(0,40px)");
    row1.appendChild(this._field(i18n.t("type.font"), this._fontSelect()));
    row1.appendChild(this._field(i18n.t("type.color"), this._colorInput()));
    body.appendChild(row1);

    // Row 2: Size + Weight + Style
    const row2 = this._grid("minmax(0,1fr) minmax(0,64px) minmax(0,72px)");
    row2.appendChild(this._field(i18n.t("type.size"), this._sizeField()));
    row2.appendChild(this._field(i18n.t("type.weight"), this._weightSelect()));
    row2.appendChild(this._field(i18n.t("type.style"), this._styleSelect()));
    body.appendChild(row2);

    // Row 3: Direction + Alignment (align icons follow direction)
    const row3 = this._grid("minmax(0,1fr) minmax(0,1fr)");
    row3.appendChild(
      this._field(i18n.t("type.direction"), this._directionSegmented()),
    );
    row3.appendChild(
      this._field(i18n.t("type.alignment"), this._alignSegmented()),
    );
    body.appendChild(row3);

    // Row 4: Border — toggle + color well (one field so they align), width
    const row4 = this._grid("minmax(0,1fr) minmax(0,1fr)");
    const borderGroup = document.createElement("div");
    borderGroup.className = "flex items-center gap-1 min-w-0";
    borderGroup.appendChild(this._strokeToggle());
    borderGroup.appendChild(this._strokeColorInput());
    row4.appendChild(this._field(i18n.t("type.strokeColor"), borderGroup));
    row4.appendChild(
      this._field(i18n.t("type.strokeWidth"), this._strokeWidth()),
    );
    body.appendChild(row4);

    // Row 5: Rotation
    body.appendChild(
      this._field(i18n.t("type.rotation"), this._rotationField()),
    );
  },

  /** Refresh control values from the selected layer */
  refresh(): void {
    const host = document.getElementById("type-section");
    if (!host) return;
    const page: Page | null = state.getActivePage();
    const layer = selectedTextLayer(page);
    // Always visible; no selection edits the global defaults (which new
    // layers inherit), selection edits the layer.
    host.classList.remove("hidden");
    host.classList.toggle("type-disabled", false);
    host
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >("input, select, button")
      .forEach(function (el) {
        el.disabled = false;
      });
    const t = layer ? layer.typography : _globalType;
    const set = function (id: string, value: string): void {
      const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(
        "#" + id,
      );
      if (el && document.activeElement !== el) el.value = value;
    };
    set("type-font", t.fontFamily || "");
    const trig = host.querySelector<HTMLButtonElement>("#type-font-trigger");
    if (trig) {
      trig.textContent = _fontDisplayName(t.fontFamily || null);
      trig.style.fontFamily = _fontFamilyCss(t.fontFamily || null);
    }
    set("type-color", t.color);
    const sizeEl = host.querySelector<HTMLInputElement>("#type-size");
    if (sizeEl && document.activeElement !== sizeEl) {
      if (t.fontSize == null || !(t.fontSize > 0)) {
        sizeEl.value = "";
        sizeEl.placeholder = i18n.t("type.autoFit");
      } else {
        sizeEl.value = String(t.fontSize);
        sizeEl.placeholder = i18n.t("type.autoFit");
      }
    }
    set("type-weight", String(t.fontWeight));
    set("type-style", t.fontStyle);
    set("type-stroke-color", t.strokeColor || "#ffffff");
    set("type-stroke-width", String(t.strokeWidth));
    const rot = Math.round(t.rotation);
    set("type-rotation", String(rot));
    const rotSlider = host.querySelector<HTMLInputElement>("#type-rotation-slider");
    if (rotSlider && document.activeElement !== rotSlider)
      rotSlider.value = String(rot);

    // Direction + alignment segmented active state
    const dir = t.direction === "vertical" ? "vertical" : "horizontal";
    host
      .querySelectorAll<HTMLButtonElement>("[data-direction]")
      .forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.direction === dir);
      });
    typeSection._syncAlignIcons(host, dir);
    host
      .querySelectorAll<HTMLButtonElement>("[data-align]")
      .forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.align === t.align);
      });
    // Stroke toggle visual
    const strokeToggle =
      host.querySelector<HTMLButtonElement>("#type-stroke-on");
    if (strokeToggle)
      strokeToggle.classList.toggle(
        "active",
        !!t.strokeColor && t.strokeWidth > 0,
      );
    // Color well dims while the border is off
    const strokeColor =
      host.querySelector<HTMLInputElement>("#type-stroke-color");
    if (strokeColor)
      strokeColor.classList.toggle(
        "off",
        !(t.strokeColor && t.strokeWidth > 0),
      );
  },

  // ── Control factories ──

  _grid(cols: string): HTMLElement {
    const div = document.createElement("div");
    div.style.display = "grid";
    div.style.gridTemplateColumns = cols;
    div.style.gap = "6px";
    return div;
  },

  _field(labelText: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-0.5 min-w-0";
    const label = document.createElement("span");
    label.className = "type-field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(control);
    return wrap;
  },

  /** Font picker — floating draggable panel (Photoshop/Figma style): title
   * bar drag handle, resizable, search + recent fonts, per-font preview.
   * A hidden native select (id type-font) stays as the refresh() sync
   * target. */
  _fontSelect(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "font-picker";

    // Hidden native select — value sync target for refresh()
    const sel = document.createElement("select");
    sel.id = "type-font";
    sel.style.display = "none";
    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = i18n.t("type.defaultFont");
    sel.appendChild(defOpt);
    (state.fontList || []).forEach(function (f) {
      const opt = document.createElement("option");
      opt.value = internalFontName(f.family);
      opt.textContent = f.family;
      sel.appendChild(opt);
    });
    wrap.appendChild(sel);

    // Trigger button
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "type-font-trigger";
    trigger.className = "field-select font-picker-trigger";
    trigger.textContent = _fontDisplayName(sel.value || null);
    trigger.style.fontFamily = _fontFamilyCss(sel.value || null);

    // Floating panel (position:fixed, drag via title bar, resize:both)
    const panel = document.createElement("div");
    panel.className = "font-picker-panel";
    panel.hidden = true;
    // Restore the persisted size (drag position is applied on open())
    if (_pickerSize) {
      panel.style.width = _pickerSize.w + "px";
      panel.style.height = _pickerSize.h + "px";
    }
    // Persist size changes (CSS resize:both handle) as they happen
    const ro = new ResizeObserver(function (entries) {
      if (panel.hidden) return; // display:none reports 0×0
      const r = entries[entries.length - 1].contentRect;
      _pickerSize = { w: Math.round(r.width), h: Math.round(r.height) };
      localStorage.setItem(PICKER_SIZE_KEY, JSON.stringify(_pickerSize));
    });
    ro.observe(panel);
    const head = document.createElement("div");
    head.className = "font-picker-panel-head";
    const title = document.createElement("span");
    title.className = "font-picker-panel-title";
    title.textContent = i18n.t("type.font");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "font-picker-close";
    closeBtn.innerHTML = lucideIcon("x");
    head.appendChild(title);
    head.appendChild(closeBtn);
    createIcons({ root: closeBtn });
    const search = document.createElement("input");
    search.type = "text";
    search.className = "font-picker-search";
    search.placeholder = i18n.t("type.searchFont");
    const list = document.createElement("div");
    list.className = "font-picker-list";
    panel.appendChild(head);
    panel.appendChild(search);
    panel.appendChild(list);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    const close = function (): void {
      panel.hidden = true;
      _openFontPicker = null;
      _openFontWrap = null;
    };

    /** Rebuild the item list filtered by the search query */
    const renderList = function (): void {
      const q = search.value.toLowerCase();
      const current = sel.value;
      list.innerHTML = "";

      const item = function (
        value: string,
        label: string,
        family?: string,
      ): void {
        const b = document.createElement("button");
        b.type = "button";
        b.className =
          "font-picker-item" + (value === current ? " selected" : "");
        b.dataset.value = value;
        const sample = document.createElement("span");
        sample.className = "font-picker-sample";
        sample.textContent = "Ag";
        if (family) sample.style.fontFamily = family;
        const name = document.createElement("span");
        name.className = "font-picker-name";
        name.textContent = label;
        if (family) name.style.fontFamily = family;
        b.appendChild(sample);
        b.appendChild(name);
        b.addEventListener("click", function () {
          if (sel.value !== value) {
            sel.value = value;
            trigger.textContent = _fontDisplayName(value || null);
            trigger.style.fontFamily = _fontFamilyCss(value || null);
            typeSection._apply({ fontFamily: value || null });
            if (value) {
              const recents = loadRecentFonts();
              saveRecentFonts(
                [value].concat(
                  recents.filter(function (r) {
                    return r !== value;
                  }),
                ),
              );
            }
          }
          close();
        });
        list.appendChild(b);
      };

      const fonts = state.fontList || [];
      const byInternal = new Map<string, string>(
        fonts.map(function (f) {
          return [internalFontName(f.family), f.family];
        }),
      );

      if (q === "") {
        const recents = loadRecentFonts()
          .filter(function (r) {
            return byInternal.has(r);
          })
          .slice(0, MAX_RECENT_FONTS);
        if (recents.length > 0) {
          const head = document.createElement("div");
          head.className = "font-picker-head";
          head.textContent = i18n.t("type.recent");
          list.appendChild(head);
          recents.forEach(function (r) {
            const fam = byInternal.get(r) as string;
            item(r, fam, fam);
          });
        }
        // "All fonts" sits flush under search (or under Recent) — Default
        // belongs in this section, not above the category header.
        const allHead = document.createElement("div");
        allHead.className = "font-picker-head";
        allHead.textContent = i18n.t("type.allFonts");
        list.appendChild(allHead);
        item("", i18n.t("type.defaultFont"));
        fonts.forEach(function (f) {
          item(internalFontName(f.family), f.family, f.family);
        });
      } else {
        fonts.forEach(function (f) {
          if (f.family.toLowerCase().indexOf(q) !== -1) {
            item(internalFontName(f.family), f.family, f.family);
          }
        });
      }
    };

    const open = function (): void {
      search.value = "";
      renderList();
      panel.hidden = false;
      const pr = panel.getBoundingClientRect();
      if (_pickerPos) {
        // Restore the last position, clamped to the current viewport
        panel.style.left =
          Math.max(
            8,
            Math.min(_pickerPos.x, window.innerWidth - pr.width - 8),
          ) + "px";
        panel.style.top =
          Math.max(
            8,
            Math.min(_pickerPos.y, window.innerHeight - pr.height - 8),
          ) + "px";
      } else {
        // Position below the trigger, then flip/clamp if it would overflow
        const tr = trigger.getBoundingClientRect();
        panel.style.left = tr.left + "px";
        panel.style.top = tr.bottom + 4 + "px";
        const pr2 = panel.getBoundingClientRect();
        if (pr2.bottom > window.innerHeight - 8) {
          panel.style.top = Math.max(8, tr.top - pr2.height - 4) + "px";
        }
        if (pr2.right > window.innerWidth - 8) {
          panel.style.left =
            Math.max(8, window.innerWidth - pr2.width - 8) + "px";
        }
      }
      _openFontPicker = panel;
      _openFontWrap = wrap;
      search.focus();
    };

    // Drag via the title bar (clamped to the window)
    let dragOff = { x: 0, y: 0 };
    head.addEventListener("mousedown", function (e) {
      if ((e.target as HTMLElement).closest(".font-picker-close")) return;
      if (panel.hidden) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      dragOff = { x: e.clientX - r.left, y: e.clientY - r.top };
      document.body.style.userSelect = "none";
      const onMove = function (ev: MouseEvent): void {
        const x = Math.min(
          Math.max(8, ev.clientX - dragOff.x),
          window.innerWidth - 80,
        );
        const y = Math.min(
          Math.max(8, ev.clientY - dragOff.y),
          window.innerHeight - 48,
        );
        panel.style.left = x + "px";
        panel.style.top = y + "px";
      };
      const onUp = function (): void {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        _pickerPos = {
          x: parseFloat(panel.style.left) || 0,
          y: parseFloat(panel.style.top) || 0,
        };
        localStorage.setItem(PICKER_POS_KEY, JSON.stringify(_pickerPos));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    trigger.addEventListener("click", function () {
      if (panel.hidden) open();
      else close();
    });
    closeBtn.addEventListener("click", close);
    search.addEventListener("input", renderList);
    // Enter in the search box picks the first matching font
    search.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      const items = Array.from(
        list.querySelectorAll<HTMLButtonElement>(".font-picker-item"),
      );
      const first =
        items.find(function (b) {
          return b.dataset.value !== "";
        }) || items[0];
      if (first) first.click();
    });

    return wrap;
  },
  _colorInput(): HTMLElement {
    const input = document.createElement("input");
    input.type = "color";
    input.id = "type-color";
    input.className = "type-color-well";
    input.value = "#111111";
    input.addEventListener("input", function () {
      typeSection._apply({ color: this.value });
    });
    return input;
  },

  _sizeField(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-1 min-w-0";
    const input = document.createElement("input");
    input.type = "number";
    input.id = "type-size";
    input.className = "field-select w-full min-w-0";
    input.placeholder = i18n.t("type.autoFit");
    input.min = "4";
    input.max = "300";
    input.addEventListener("change", function () {
      const raw = this.value.trim();
      if (!raw) {
        typeSection._apply({ fontSize: null });
        return;
      }
      const v = parseFloat(raw);
      typeSection._apply({
        fontSize: Number.isFinite(v) && v > 0 ? v : null,
      });
    });
    wrap.appendChild(input);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "type-size-btn";
    btn.innerHTML = lucideIcon("chevron-down");
    btn.title = i18n.t("type.presets");
    createIcons({ root: btn });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const existing = document.getElementById("type-size-presets");
      if (existing) {
        existing.remove();
        _openSizeWrap = null;
        return;
      }
      const page = state.getActivePage();
      const layer = selectedTextLayer(page);
      const cur = layer ? layer.typography.fontSize : _globalType.fontSize;
      const autoOn = cur == null || !(cur > 0);
      const menu = document.createElement("div");
      menu.id = "type-size-presets";
      menu.className = "type-size-menu";
      const closeMenu = function (): void {
        menu.remove();
        if (_openSizeWrap === wrap) _openSizeWrap = null;
      };
      const autoItem = document.createElement("button");
      autoItem.className =
        "type-size-item" + (autoOn ? " active" : "");
      autoItem.textContent = i18n.t("type.autoFit");
      autoItem.style.fontStyle = "italic";
      autoItem.addEventListener("click", function () {
        input.value = "";
        input.placeholder = i18n.t("type.autoFit");
        typeSection._apply({ fontSize: null });
        closeMenu();
      });
      menu.appendChild(autoItem);
      FONT_SIZE_PRESETS.forEach(function (s) {
        const item = document.createElement("button");
        item.className =
          "type-size-item" + (!autoOn && cur === s ? " active" : "");
        item.textContent = String(s);
        item.addEventListener("click", function () {
          input.value = String(s);
          typeSection._apply({ fontSize: s });
          closeMenu();
        });
        menu.appendChild(item);
      });
      wrap.appendChild(menu);
      _openSizeWrap = wrap;
    });
    wrap.appendChild(btn);
    return wrap;
  },

  _weightSelect(): HTMLElement {
    const sel = document.createElement("select");
    sel.id = "type-weight";
    sel.className = "field-select";
    WEIGHTS.forEach(function (w) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = String(w);
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      typeSection._apply({ fontWeight: parseInt(this.value, 10) });
    });
    return sel;
  },

  _styleSelect(): HTMLElement {
    const sel = document.createElement("select");
    sel.id = "type-style";
    sel.className = "field-select";
    for (const [value, key] of [
      ["normal", "type.styles.normal"],
      ["italic", "type.styles.italic"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = i18n.t(key);
      sel.appendChild(opt);
    }
    sel.addEventListener("change", function () {
      typeSection._apply({
        fontStyle: this.value as Typography["fontStyle"],
      });
    });
    return sel;
  },

  _directionSegmented(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "type-align-seg type-align-seg-2";
    wrap.id = "type-direction-seg";
    for (const [value, labelKey, titleKey] of [
      ["horizontal", "type.dirH", "type.directionHorizontal"],
      ["vertical", "type.dirV", "type.directionVertical"],
    ] as const) {
      const btn = document.createElement("button");
      btn.dataset.direction = value;
      btn.className = "type-align-btn";
      btn.title = i18n.t(titleKey);
      btn.textContent = i18n.t(labelKey);
      btn.addEventListener("click", function () {
        typeSection._apply({
          direction: value as "horizontal" | "vertical",
        });
      });
      wrap.appendChild(btn);
    }
    return wrap;
  },

  _alignSegmented(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "type-align-seg";
    wrap.id = "type-align-seg";
    for (const value of ["left", "center", "right"] as const) {
      const btn = document.createElement("button");
      btn.dataset.align = value;
      btn.className = "type-align-btn";
      btn.addEventListener("click", function () {
        typeSection._apply({ align: value });
      });
      wrap.appendChild(btn);
    }
    return wrap;
  },

  /** Swap align labels: H → 左中右 / L C R, V → 上中下 / T M B. */
  _syncAlignIcons(host: HTMLElement, direction: string): void {
    const labels =
      direction === "vertical"
        ? ([
            "type.alignVTop",
            "type.alignVMiddle",
            "type.alignVBottom",
          ] as const)
        : ([
            "type.alignHLeft",
            "type.alignHCenter",
            "type.alignHRight",
          ] as const);
    const titles =
      direction === "vertical"
        ? ([
            "type.alignTop",
            "type.alignMiddle",
            "type.alignBottom",
          ] as const)
        : ([
            "type.alignLeft",
            "type.alignCenter",
            "type.alignRight",
          ] as const);
    host
      .querySelectorAll<HTMLButtonElement>("[data-align]")
      .forEach(function (btn, i) {
        const key = labels[i];
        if (!key) return;
        btn.title = i18n.t(titles[i]);
        btn.textContent = i18n.t(key);
      });
  },

  /** Border on/off toggle — works on the selected layer, or the global
   * default when nothing is selected. */
  _strokeToggle(): HTMLElement {
    const toggle = document.createElement("button");
    toggle.id = "type-stroke-on";
    toggle.className = "type-square-toggle";
    toggle.innerHTML = '<i data-lucide="square"></i>';
    toggle.title = i18n.t("type.strokeColor");
    toggle.addEventListener("click", function () {
      if (typeSection._strokeActive()) {
        typeSection._apply({ strokeColor: null, strokeWidth: 0 });
      } else {
        typeSection._apply({
          strokeColor: typeSection._currentStrokeColor(),
          strokeWidth: Math.max(1, typeSection._currentStrokeWidth()),
        });
      }
    });
    return toggle;
  },

  _strokeColorInput(): HTMLElement {
    const input = document.createElement("input");
    input.type = "color";
    input.id = "type-stroke-color";
    input.className = "type-color-well type-color-well-flex";
    input.value = "#ffffff";
    input.addEventListener("input", function () {
      typeSection._apply({
        strokeColor: this.value,
        strokeWidth: Math.max(1, typeSection._currentStrokeWidth()),
      });
    });
    return input;
  },

  _strokeActive(): boolean {
    const page: Page | null = state.getActivePage();
    const layer = selectedTextLayer(page);
    const t = layer ? layer.typography : _globalType;
    return !!t.strokeColor && t.strokeWidth > 0;
  },

  _strokeWidth(): HTMLElement {
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "type-step-btn";
    minus.innerHTML = lucideIcon("minus");
    const num = document.createElement("input");
    num.type = "number";
    num.id = "type-stroke-width";
    num.className = "field-select type-width-num";
    num.min = "0";
    num.max = "20";
    num.step = "0.5";
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "type-step-btn";
    plus.innerHTML = lucideIcon("plus");
    minus.addEventListener("click", function () {
      num.value = String(Math.max(0, parseFloat(num.value || "0") - 0.5));
      num.dispatchEvent(new Event("change"));
    });
    plus.addEventListener("click", function () {
      num.value = String(parseFloat(num.value || "0") + 0.5);
      num.dispatchEvent(new Event("change"));
    });
    num.addEventListener("change", function () {
      const v = Math.max(0, parseFloat(this.value || "0"));
      typeSection._apply({
        strokeWidth: v,
        strokeColor: v > 0 ? typeSection._currentStrokeColor() : null,
      });
    });
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-1 type-stepper type-stepper-w";
    wrap.appendChild(minus);
    wrap.appendChild(num);
    wrap.appendChild(plus);
    createIcons({ root: wrap });
    return wrap;
  },

  _currentStrokeWidth(): number {
    const el = document.getElementById("type-stroke-width") as HTMLInputElement;
    return el ? parseFloat(el.value || "0") : 4;
  },

  _rotationField(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "flex items-center gap-1.5 type-rotation-row min-w-0";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = "type-rotation-slider";
    slider.className = "type-rotation-slider";
    slider.min = "-180";
    slider.max = "180";
    slider.step = "1";
    slider.value = "0";
    const num = document.createElement("input");
    num.type = "number";
    num.id = "type-rotation";
    num.className = "field-select type-rotation-num";
    num.min = "-180";
    num.max = "180";
    num.step = "1";
    num.value = "0";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.id = "type-rotation-reset";
    reset.className = "type-step-btn";
    reset.innerHTML = lucideIcon("rotate-ccw");
    reset.title = i18n.t("type.rotationReset");
    const syncUi = function (n: number): void {
      slider.value = String(n);
      num.value = String(n);
    };
    /** Same center-pin as the canvas rotate handle. */
    const applyLive = function (raw: string): number {
      const v = Math.max(-180, Math.min(180, parseFloat(raw || "0")));
      const n = Number.isFinite(v) ? Math.round(v) : 0;
      syncUi(n);
      const page = state.getActivePage();
      const layer = selectedTextLayer(page);
      if (!layer) {
        _globalType.rotation = n;
        saveGlobalTypography(_globalType);
        return n;
      }
      setLayerRotationPinned(layer, n);
      return n;
    };
    const commit = function (raw: string): void {
      applyLive(raw);
      history.snapshot();
      typeSection.refresh();
    };
    slider.addEventListener("input", function () {
      applyLive(this.value);
    });
    slider.addEventListener("change", function () {
      commit(this.value);
    });
    num.addEventListener("change", function () {
      commit(this.value);
    });
    reset.addEventListener("click", function () {
      commit("0");
    });
    wrap.appendChild(slider);
    wrap.appendChild(num);
    wrap.appendChild(reset);
    createIcons({ root: wrap });
    return wrap;
  },

  _currentStrokeColor(): string | null {
    const el = document.getElementById("type-stroke-color") as HTMLInputElement;
    return el ? el.value : "#ffffff";
  },

  /** Apply a partial typography update. With a text layer selected it goes
   * to that layer; without one it updates the global defaults (persisted). */
  _apply(patch: Partial<Typography>): void {
    const page: Page | null = state.getActivePage();
    const layer = selectedTextLayer(page);
    if (!layer) {
      Object.assign(_globalType, patch);
      saveGlobalTypography(_globalType);
      typeSection.refresh();
      return;
    }
    if (patch.rotation !== undefined) {
      const rest = Object.assign({}, patch);
      delete rest.rotation;
      Object.assign(layer.typography, rest);
      setLayerRotationPinned(layer, patch.rotation);
      history.snapshot();
      typeSection.refresh();
      return;
    }
    Object.assign(layer.typography, patch);
    canvas.render();
    history.snapshot();
    typeSection.refresh();
  },
};
