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
import {
  applyActivityTab,
  applyConversationMessages,
  bindConversationHandlers,
  closeConversationDetail,
  renderConversationsTable,
  updateArchiveNote,
  updatePreviewLoading,
  updatePreviewStatus,
  syncDashboardPrefs,
} from "./conversations.js";
import { renderChart } from "./chart.js";
import { renderPoolChart } from "./pool-chart.js";
import { setActiveRangeButton, formatUpdatedAt } from "./format.js";
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
import { applyStaticTranslations, t } from "./i18n.js";

function closeActivityDetail() {
  closeEventDetail();
  closeConversationDetail();
}

function renderAll() {
  if (!refs.state) return;
  if (ui.currencySelect) {
    local.currency = ui.currencySelect.value === "eur" ? "eur" : "usd";
    persistLocal();
  }
  applyStaticTranslations();
  closeActivityDetail();
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
  renderConversationsTable();
  updateArchiveNote();
  applyActivityTab();
  showError(refs.state.error);
  ui.lastUpdated.textContent = formatUpdatedAt(refs.state.generatedAt);
}

ui.rangeSelector.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  local.range = btn.dataset.range;
  resetEventsPage();
  persistLocal();
  syncDashboardPrefs();
  renderAll();
});

ui.usageFilter.addEventListener("change", () => {
  local.usageFilter = ui.usageFilter.value;
  resetEventsPage();
  persistLocal();
  syncDashboardPrefs();
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
  closeActivityDetail();
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
    vscode.postMessage({ type: "setLocale", locale: next });
    renderAll();
  });
}

if (ui.currencySelect) {
  ui.currencySelect.addEventListener("change", () => {
    const next = ui.currencySelect.value;
    if (next !== "usd" && next !== "eur") return;
    local.currency = next;
    persistLocal();
    vscode.postMessage({ type: "setCurrency", currency: next });
    applyStaticTranslations();
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
  ui.eventDetailClose.addEventListener("click", closeActivityDetail);
}
if (ui.eventDetailOverlay) {
  ui.eventDetailOverlay.addEventListener("click", (e) => {
    if (e.target === ui.eventDetailOverlay) closeActivityDetail();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.eventDetailOverlay && !ui.eventDetailOverlay.classList.contains("hidden")) {
    closeActivityDetail();
  }
});

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "init" && (msg.locale === "en" || msg.locale === "it")) {
    local.locale = msg.locale;
    persistLocal();
    applyStaticTranslations();
    if (refs.state) renderAll();
  } else if (msg.type === "initCurrency" && (msg.currency === "usd" || msg.currency === "eur")) {
    local.currency = msg.currency;
    persistLocal();
    applyStaticTranslations();
    if (refs.state) renderAll();
  } else if (msg.type === "initPreview" && typeof msg.enabled === "boolean") {
    local.conversationPreview = msg.enabled;
    applyActivityTab();
    if (refs.state && local.activityTab === "conversations") renderConversationsTable();
  } else if (msg.type === "previewLoading") {
    updatePreviewLoading(!!msg.on);
  } else if (msg.type === "previewStatus") {
    updatePreviewLoading(false);
    updatePreviewStatus(msg);
    if (refs.state && local.activityTab === "conversations") renderConversationsTable();
  } else if (msg.type === "conversationMessages" && typeof msg.conversationId === "string") {
    applyConversationMessages(msg.conversationId, msg.messages, msg.error);
  } else if (msg.type === "state") {
    if (msg.locale === "en" || msg.locale === "it") {
      local.locale = msg.locale;
      if (ui.langSelect) ui.langSelect.value = msg.locale;
    }
    if (msg.currency === "usd" || msg.currency === "eur") {
      local.currency = msg.currency;
      if (ui.currencySelect) ui.currencySelect.value = msg.currency;
    }
    persistLocal();
    setState(msg.state);
    renderAll();
  } else if (msg.type === "loading") {
    ui.refreshBtn.disabled = !!msg.on;
    ui.refreshBtn.textContent = msg.on ? t("refreshing") : t("refresh");
  }
});

applyStaticTranslations();
applySectionState();
applyActivityTab();
bindConversationHandlers(vscode);
vscode.postMessage({ type: "ready" });
syncDashboardPrefs();
