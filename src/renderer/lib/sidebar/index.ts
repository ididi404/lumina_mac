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
/** Min space left for tabs + layer/mask list under the Type section. */
const TYPE_LIST_RESERVE = 96;
const TYPE_STORAGE_KEY = "lumina-type-height";
/** Only honor stored height after the user has dragged the splitter. */
const TYPE_USER_SIZED_KEY = "lumina-type-height-user";

function loadTypeHeight(): number | null {
  // Ignore legacy short heights saved before the "fit content" default —
  // they clipped typography controls on every launch.
  if (localStorage.getItem(TYPE_USER_SIZED_KEY) !== "1") return null;
  const raw = localStorage.getItem(TYPE_STORAGE_KEY);
  const v = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

let _typeHeight: number | null = loadTypeHeight();
let _activeTab: "layers" | "masks" = "layers";
// Per-tab scroll of the list — sidebar.render() rebuilds the list DOM, which
// would otherwise reset the scroll to top on every selection/toggle.
let _tabScroll: Record<"layers" | "masks", number> = { layers: 0, masks: 0 };
let _scrollObserver: ResizeObserver | null = null;

/** Available height for a user-dragged Type section. */
function typeMaxHeight(scroll: HTMLElement): number {
  return Math.max(TYPE_MIN_HEIGHT, scroll.clientHeight - TYPE_LIST_RESERVE);
}

/**
 * Default: leave height/maxHeight to CSS (content-sized) — no JS measure that
 * races first layout and clamps to a short wrong value.
 * After the user drags the splitter, apply an explicit pixel height.
 */
function applyTypeHeight(typeHost: HTMLElement, scroll: HTMLElement): void {
  if (typeSection.isCollapsed()) {
    typeHost.style.height = "";
    typeHost.style.maxHeight = "";
    return;
  }
  if (_typeHeight == null) {
    typeHost.style.height = "";
    typeHost.style.maxHeight = "";
    return;
  }
  // Sidebar may still be 0-height on the very first frame — skip until laid out.
  if (scroll.clientHeight < TYPE_MIN_HEIGHT + TYPE_LIST_RESERVE) return;
  const max = typeMaxHeight(scroll);
  const h = Math.min(Math.max(_typeHeight, TYPE_MIN_HEIGHT), max);
  typeHost.style.maxHeight = "none";
  typeHost.style.height = h + "px";
}

function ensureScrollObserver(scroll: HTMLElement): void {
  if (_scrollObserver) return;
  _scrollObserver = new ResizeObserver(function () {
    if (typeSection.isCollapsed()) return;
    const el = document.getElementById("type-section");
    if (!el) return;
    applyTypeHeight(el, scroll);
  });
  _scrollObserver.observe(scroll);
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
    // From CSS auto height, offsetHeight is the true content size.
    const startH = typeHost.offsetHeight;
    typeHost.style.maxHeight = "none";
    document.body.classList.add("resizing-row");
    const onMove = function (ev: MouseEvent) {
      const max = typeMaxHeight(scroll);
      const h = Math.min(
        Math.max(startH + (ev.clientY - startY), TYPE_MIN_HEIGHT),
        Math.max(max, TYPE_MIN_HEIGHT),
      );
      typeHost.style.height = h + "px";
    };
    const onUp = function () {
      document.body.classList.remove("resizing-row");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      _typeHeight = typeHost.offsetHeight;
      localStorage.setItem(TYPE_STORAGE_KEY, String(_typeHeight));
      localStorage.setItem(TYPE_USER_SIZED_KEY, "1");
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

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
    ensureScrollObserver(scroll);

    // Preserve scroll position across the DOM rebuild below (keyed by tab)
    const prevList = scroll.querySelector<HTMLElement>(".layer-list");
    if (prevList) _tabScroll[_activeTab] = prevList.scrollTop;

    scroll.innerHTML = "";

    const page: Page | null = state.getActivePage();
    const total = page ? (page.layers || []).length : 0;
    const maskCount = page ? (page.inpaintMasks || []).length : 0;

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

    if (!typeSection.isCollapsed()) {
      const splitter = document.createElement("div");
      splitter.className = "sidebar-splitter";
      splitter.title = i18n.t("sidebar.resizeType");
      splitter.innerHTML = '<span class="sidebar-splitter-grip"></span>';
      scroll.appendChild(splitter);
      wireSplitter(splitter, typeHost, scroll);
    }

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
    applyTypeHeight(typeHost, scroll);
  },
};
