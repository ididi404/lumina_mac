/** Lumina Sidebar (entry) — koharu-style Type + Layers|Masks panels */
import { state } from "../state";
import * as i18n from "../i18n";
import { createIcons } from "../ui/icons";
import type { Page } from "../../types";
import { layerListHTML, wireEvents } from "./layer-list";
import { maskListHTML, wireMaskEvents } from "./mask-list";
import { typeSection } from "./type-section";
import { esc } from "./_esc";

const TYPE_MIN_HEIGHT = 72;
const TYPE_STORAGE_KEY = "lumina-type-height";

function loadTypeHeight(): number | null {
  const raw = localStorage.getItem(TYPE_STORAGE_KEY);
  const v = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

let _typeHeight: number | null = loadTypeHeight();
let _activeTab: "layers" | "masks" = "layers";
// Per-tab scroll of the list — sidebar.render() rebuilds the list DOM, which
// would otherwise reset the scroll to top on every selection/toggle.
let _tabScroll: Record<"layers" | "masks", number> = { layers: 0, masks: 0 };

/** Available height for the Type section (leave room for tabs + list). */
function typeMaxHeight(scroll: HTMLElement): number {
  return Math.max(TYPE_MIN_HEIGHT, scroll.clientHeight - 48);
}

/** Natural content height with no CSS/height clamp. */
function typeNaturalHeight(typeHost: HTMLElement): number {
  const prevH = typeHost.style.height;
  const prevMax = typeHost.style.maxHeight;
  typeHost.style.maxHeight = "none";
  typeHost.style.height = "auto";
  const natural = typeHost.scrollHeight;
  typeHost.style.height = prevH;
  typeHost.style.maxHeight = prevMax;
  return Math.max(TYPE_MIN_HEIGHT, natural);
}

/**
 * Default: fit full typography content. If the user has dragged the splitter,
 * honor that stored height (can be shorter — section scrolls internally).
 */
function applyTypeHeight(typeHost: HTMLElement, scroll: HTMLElement): void {
  if (typeSection.isCollapsed()) {
    typeHost.style.height = "";
    typeHost.style.maxHeight = "";
    return;
  }
  const max = typeMaxHeight(scroll);
  const preferred =
    _typeHeight != null ? _typeHeight : typeNaturalHeight(typeHost);
  const h = Math.min(Math.max(preferred, TYPE_MIN_HEIGHT), max);
  typeHost.style.maxHeight = "none";
  typeHost.style.height = h + "px";
}

/** Drag the splitter to resize the Type section height (Photoshop-style). */
function wireSplitter(
  splitter: HTMLElement,
  typeHost: HTMLElement,
  scroll: HTMLElement,
): void {
  splitter.addEventListener("mousedown", function (e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = typeHost.offsetHeight;
    typeHost.style.maxHeight = "none";
    document.body.classList.add("resizing-row");
    const onMove = function (ev: MouseEvent) {
      const max = typeMaxHeight(scroll);
      const h = Math.min(
        Math.max(startH + (ev.clientY - startY), TYPE_MIN_HEIGHT),
        max,
      );
      typeHost.style.height = h + "px";
    };
    const onUp = function () {
      document.body.classList.remove("resizing-row");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      _typeHeight = typeHost.offsetHeight;
      localStorage.setItem(TYPE_STORAGE_KEY, String(_typeHeight));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// Re-clamp the Type section height on window resize — without a render the
// stored height stays stale and can clip the layer list at the sidebar edge.
window.addEventListener("resize", function () {
  if (typeSection.isCollapsed()) return;
  const el = document.getElementById("type-section");
  const scroll = document.getElementById("sidebar-scroll");
  if (!el || !scroll) return;
  applyTypeHeight(el, scroll);
});

function tabHTML(
  tab: "layers" | "masks",
  label: string,
  count: number,
  icon: string,
): string {
  return (
    '<button class="sidebar-tab' +
    (_activeTab === tab ? " active" : "") +
    '" data-tab="' +
    tab +
    '">' +
    '<i data-lucide="' +
    icon +
    '"></i>' +
    "<span>" +
    esc(label) +
    "</span>" +
    '<span class="sidebar-tab-count">' +
    count +
    "</span>" +
    "</button>"
  );
}

export const sidebar = {
  /** Programmatic tab switch (paint-tool warn flow auto-opens Masks) */
  setActiveTab(tab: "layers" | "masks"): void {
    if (_activeTab === tab) return;
    _activeTab = tab;
    this.render();
  },

  render(): void {
    const scroll = document.getElementById("sidebar-scroll");
    if (!scroll) return;

    // Preserve scroll position across the DOM rebuild below (keyed by tab)
    const prevList = scroll.querySelector<HTMLElement>(".layer-list");
    if (prevList) _tabScroll[_activeTab] = prevList.scrollTop;

    scroll.innerHTML = "";

    const page: Page | null = state.getActivePage();
    const total = page ? (page.layers || []).length : 0;
    const maskCount = page ? (page.inpaintMasks || []).length : 0;

    // Type section (header click collapses); height fitted after icons paint
    const typeHost = document.createElement("div");
    scroll.appendChild(typeHost);
    typeSection.build(typeHost);
    typeSection.refresh();
    const typeHeader = typeHost.querySelector<HTMLElement>(".type-header");
    if (typeHeader) {
      typeHeader.addEventListener("click", function () {
        typeSection.toggleCollapsed();
        sidebar.render();
      });
    }

    // Photoshop-style height splitter between Type and tabs/list
    // (not shown when the Type section is collapsed)
    if (!typeSection.isCollapsed()) {
      const splitter = document.createElement("div");
      splitter.className = "sidebar-splitter";
      splitter.title = i18n.t("sidebar.resizeType");
      splitter.innerHTML = '<span class="sidebar-splitter-grip"></span>';
      scroll.appendChild(splitter);
      wireSplitter(splitter, typeHost, scroll);
    }

    // Tab bar: Layers | Masks
    const tabs = document.createElement("div");
    tabs.className = "sidebar-tabs shrink-0";
    tabs.innerHTML =
      tabHTML("layers", i18n.t("sidebar.tabLayers"), total, "layers") +
      tabHTML("masks", i18n.t("sidebar.tabMasks"), maskCount, "eraser");
    scroll.appendChild(tabs);

    tabs
      .querySelectorAll<HTMLButtonElement>(".sidebar-tab")
      .forEach(function (b) {
        b.addEventListener("click", function () {
          const t = b.getAttribute("data-tab");
          if (t === "layers" || t === "masks") {
            _activeTab = t;
            sidebar.render();
          }
        });
      });

    // Active panel content (single scrollable region below the tabs)
    const content = document.createElement("div");
    content.className =
      "layer-list flex-1 min-h-0 overflow-y-auto custom-scrollbar";
    scroll.appendChild(content);

    if (_activeTab === "masks") {
      content.innerHTML = maskListHTML(page);
      wireMaskEvents();
    } else {
      content.innerHTML = layerListHTML(page);
      wireEvents();
    }

    content.scrollTop = _tabScroll[_activeTab] || 0;

    createIcons();
    // Measure after lucide SVGs replace <i> placeholders so height fits.
    applyTypeHeight(typeHost, scroll);
  },
};
