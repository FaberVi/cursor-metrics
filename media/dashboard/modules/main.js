import {
  applySectionState,
  EVENTS_PAGE_SIZES,
  local,
  paginateList,
  persistLocal,
  refs,
  resetEventsPage,
  setState,
  ui,
  vscode,
} from "./core.js";
import { applyStaticTranslations, getDateLocale, t } from "./i18n.js";
import { renderChart } from "./chart.js";
import { renderPoolChart } from "./pool-chart.js";
import { setActiveRangeButton } from "./format.js";
import { renderSummaryCards } from "./summary.js";
import {
  applyTeamMemberConstraints,
  closeEventDetail,
  exportCsv,
  getSortedEvents,
  renderBreakdown,
  renderTable,
  showError,
  showEventDetail,
} from "./tables.js";

function renderAll() {
  if (!refs.state) return;
  applyStaticTranslations();
  closeEventDetail();
  applySectionState();
  setActiveRangeButton();
  ui.usageFilter.value = local.usageFilter;
  ui.metricFilter.value = local.metric;
  applyTeamMemberConstraints();
  renderSummaryCards();
  renderChart();
  renderPoolChart();
  renderBreakdown();
  renderTable();
  showError(refs.state.error);
  ui.lastUpdated.textContent =
    t("updated") + " " + new Date(refs.state.generatedAt).toLocaleTimeString(getDateLocale());
}

ui.rangeSelector.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  local.range = btn.dataset.range;
  resetEventsPage();
  persistLocal();
  renderAll();
});

ui.usageFilter.addEventListener("change", () => {
  local.usageFilter = ui.usageFilter.value;
  resetEventsPage();
  persistLocal();
  renderChart();
  renderBreakdown();
  renderTable();
});

ui.metricFilter.addEventListener("change", () => {
  local.metric = ui.metricFilter.value;
  persistLocal();
  renderChart();
});

ui.tableHead.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const key = th.dataset.sort;
  if (local.sortKey === key) {
    local.sortOrder = local.sortOrder === "asc" ? "desc" : "asc";
  } else {
    local.sortKey = key;
    local.sortOrder = key === "model" || key === "kind" ? "asc" : "desc";
  }
  resetEventsPage();
  closeEventDetail();
  persistLocal();
  renderTable();
});

ui.tableBody.addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-event-idx]");
  if (!row) return;
  const idx = Number(row.dataset.eventIdx);
  const events = getSortedEvents();
  if (!Number.isFinite(idx) || idx < 0 || idx >= events.length) return;
  showEventDetail(events[idx], idx);
});

if (ui.breakdownHead) {
  ui.breakdownHead.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (local.breakdownSortKey === key) {
      local.breakdownSortOrder = local.breakdownSortOrder === "asc" ? "desc" : "asc";
    } else {
      local.breakdownSortKey = key;
      local.breakdownSortOrder = key === "model" ? "asc" : "desc";
    }
    persistLocal();
    renderBreakdown();
  });
}

ui.refreshBtn.addEventListener("click", () => {
  vscode.postMessage({ type: "refresh" });
});

if (ui.langSelect) {
  ui.langSelect.addEventListener("change", () => {
    const next = ui.langSelect.value;
    if (next !== "en" && next !== "it") return;
    local.locale = next;
    persistLocal();
    renderAll();
  });
}

ui.exportBtn.addEventListener("click", exportCsv);

ui.pagination.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || btn.disabled) return;
  const events = getSortedEvents();
  const current = paginateList(events, local.eventsPage, local.eventsPageSize);
  const action = btn.dataset.action;
  if (action === "first") local.eventsPage = 1;
  else if (action === "prev") local.eventsPage = Math.max(1, current.page - 1);
  else if (action === "next") local.eventsPage = Math.min(current.totalPages, current.page + 1);
  else if (action === "last") local.eventsPage = current.totalPages;
  else return;
  persistLocal();
  renderTable();
});

ui.pagination.addEventListener("change", (e) => {
  if (e.target.id !== "events-page-size") return;
  const nextSize = Number(e.target.value);
  if (!EVENTS_PAGE_SIZES.includes(nextSize) || nextSize === local.eventsPageSize) return;
  local.eventsPageSize = nextSize;
  resetEventsPage();
  persistLocal();
  renderTable();
});

document.querySelectorAll(".section-title-row[data-toggle-section]").forEach((row) => {
  row.addEventListener("click", () => {
    const section = row.dataset.toggleSection;
    if (!section || !Object.prototype.hasOwnProperty.call(local.sectionOpen, section)) return;
    local.sectionOpen[section] = !local.sectionOpen[section];
    persistLocal();
    applySectionState();
    if (section === "usage" && local.sectionOpen.usage && refs.state) {
      renderChart();
    }
    if (section === "pool" && local.sectionOpen.pool && refs.state) {
      renderPoolChart();
    }
  });
});

if (ui.eventDetailClose) {
  ui.eventDetailClose.addEventListener("click", closeEventDetail);
}
if (ui.eventDetailOverlay) {
  ui.eventDetailOverlay.addEventListener("click", (e) => {
    if (e.target === ui.eventDetailOverlay) closeEventDetail();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.eventDetailOverlay && !ui.eventDetailOverlay.classList.contains("hidden")) {
    closeEventDetail();
  }
});

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "state") {
    setState(msg.state);
    renderAll();
  } else if (msg.type === "loading") {
    ui.refreshBtn.disabled = !!msg.on;
    ui.refreshBtn.textContent = msg.on ? t("refreshing") : t("refresh");
  }
});

applyStaticTranslations();
applySectionState();
vscode.postMessage({ type: "ready" });
