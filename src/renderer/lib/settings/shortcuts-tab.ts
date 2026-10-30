/** Settings: Shortcuts tab (keybinding list + capture) */
import * as i18n from "../i18n";
import { ui } from "../ui";
import { shortcuts } from "../shortcuts";
import { createIcons } from "../ui/icons";
import {
  getZoomWheelMode,
  setZoomWheelMode,
  type ZoomWheelMode,
} from "../canvas/viewport";

type ActionId = Parameters<typeof shortcuts.get>[0] extends infer A ? A : never;

export const shortcutsTab = {
  build(pane: HTMLElement): void {
    pane.innerHTML = "";

    const section = document.createElement("div");
    section.className = "settings-section";

    // Same row layout as keybindings so the control lines up with .shortcut-key.
    const zoomRow = document.createElement("div");
    zoomRow.className = "shortcut-row";
    const zoomLabel = document.createElement("span");
    zoomLabel.className = "shortcut-name";
    zoomLabel.textContent = i18n.t("shortcuts.zoomWheel");
    const zoomSel = document.createElement("select");
    zoomSel.id = "settings-zoom-wheel";
    zoomSel.className = "field-select shortcut-zoom-select";
    const optOff = document.createElement("option");
    optOff.value = "off";
    optOff.textContent = i18n.t("shortcuts.zoomWheelOff");
    const optWheel = document.createElement("option");
    optWheel.value = "wheel";
    optWheel.textContent = i18n.t("shortcuts.zoomWheelOn");
    zoomSel.appendChild(optOff);
    zoomSel.appendChild(optWheel);
    zoomSel.value = getZoomWheelMode();
    zoomSel.addEventListener("change", function () {
      const mode = (zoomSel.value === "wheel" ? "wheel" : "off") as ZoomWheelMode;
      setZoomWheelMode(mode);
    });
    // Spacer matches .shortcut-reset so the select aligns with key buttons.
    const zoomPad = document.createElement("span");
    zoomPad.className = "shortcut-reset shortcut-zoom-pad";
    zoomPad.setAttribute("aria-hidden", "true");
    zoomRow.appendChild(zoomLabel);
    zoomRow.appendChild(zoomSel);
    zoomRow.appendChild(zoomPad);
    section.appendChild(zoomRow);

    const list = document.createElement("div");
    list.id = "shortcut-list";
    section.appendChild(list);
    pane.appendChild(section);
  },

  refresh(): void {
    const sel = document.getElementById(
      "settings-zoom-wheel",
    ) as HTMLSelectElement | null;
    if (sel) sel.value = getZoomWheelMode();
    this._render();
  },

  resetAll(): void {
    shortcuts.resetAll();
    setZoomWheelMode("off");
    const sel = document.getElementById(
      "settings-zoom-wheel",
    ) as HTMLSelectElement | null;
    if (sel) sel.value = "off";
  },

  refreshTitles(): void {
    shortcuts.updateHeaderTitles();
  },

  _render(): void {
    const list = document.getElementById("shortcut-list");
    if (!list) return;
    list.innerHTML = "";

    const labels: Record<string, string> = {
      undo: i18n.t("shortcuts.undo"),
      redo: i18n.t("shortcuts.redo"),
      toolSelect: i18n.t("tools.select"),
      toolLasso: i18n.t("tools.lasso"),
      toolRect: i18n.t("tools.rect"),
      toolText: i18n.t("tools.text"),
      zoomIn: i18n.t("zoom.zoomIn"),
      zoomOut: i18n.t("zoom.zoomOut"),
      zoomFit: i18n.t("zoom.fit"),
      export: i18n.t("export.title"),
      exportAll: i18n.t("export.titleAll"),
    };

    (Object.keys(labels) as ActionId[]).forEach(function (action) {
      const row = document.createElement("div");
      row.className = "shortcut-row";

      const name = document.createElement("span");
      name.className = "shortcut-name";
      name.textContent = labels[action];

      const btn = document.createElement("button");
      btn.className = "shortcut-key";
      btn.textContent = shortcuts.get(action);
      btn.dataset.action = action;

      btn.addEventListener("click", function () {
        btn.textContent = i18n.t("shortcuts.pressKey");
        btn.classList.add("listening");

        function onKey(e: KeyboardEvent): void {
          e.preventDefault();
          e.stopPropagation();
          document.removeEventListener("keydown", onKey, true);

          if (e.key === "Escape") {
            btn.textContent = shortcuts.get(action);
            btn.classList.remove("listening");
            return;
          }

          const combo = shortcuts.eventToCombo(e);
          if (!combo) return; // still holding modifiers

          // Conflict check
          const conflict = shortcuts.findByCombo(combo);
          if (conflict && conflict !== action) {
            btn.textContent = shortcuts.get(action);
            btn.classList.remove("listening");
            ui.toast(
              i18n.t("shortcuts.conflict", { combo: combo }),
              "warn",
              3000,
            );
            return;
          }

          shortcuts.set(action, combo);
          btn.textContent = combo;
          btn.classList.remove("listening");
        }
        document.addEventListener("keydown", onKey, true);
      });

      const resetBtn = document.createElement("button");
      resetBtn.className = "shortcut-reset";
      resetBtn.title = i18n.t("shortcuts.reset");
      resetBtn.innerHTML = '<i data-lucide="rotate-ccw"></i>';
      resetBtn.addEventListener("click", function () {
        shortcuts.set(action, shortcuts.defaults[action]);
        btn.textContent = shortcuts.get(action);
      });

      row.appendChild(name);
      row.appendChild(btn);
      row.appendChild(resetBtn);
      list.appendChild(row);
    });

    createIcons();
  },
};
