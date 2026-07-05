export const vscode = acquireVsCodeApi();
export const DAY_MS = 86_400_000;
export const EVENTS_PAGE_SIZES = [25, 50, 100, 200];
export const DEFAULT_EVENTS_PAGE_SIZE = 50;

export const ui = {
  summaryCards: document.getElementById("summary-cards"),
  rangeSelector: document.getElementById("range-selector"),
  usageFilter: document.getElementById("usage-filter"),
  metricFilter: document.getElementById("metric-filter"),
  canvas: document.getElementById("usage-chart"),
  chartNote: document.getElementById("chart-note"),
  poolCanvas: document.getElementById("pool-chart"),
  poolPaceCanvas: document.getElementById("pool-pace-chart"),
  poolChartNote: document.getElementById("pool-chart-note"),
  tableBody: document.querySelector("#events-table tbody"),
  tableHead: document.querySelector("#events-table thead"),
  breakdownBody: document.querySelector("#breakdown-table tbody"),
  breakdownHead: document.querySelector("#breakdown-table thead"),
  breakdownRangeLabel: document.getElementById("breakdown-range-label"),
  pagination: document.getElementById("pagination"),
  planBanner: document.getElementById("plan-banner"),
  refreshBtn: document.getElementById("refresh-btn"),
  langSelect: document.getElementById("lang-select"),
  exportBtn: document.getElementById("export-csv"),
  lastUpdated: document.getElementById("last-updated"),
  errorBanner: document.getElementById("error-banner"),
  eventDetailOverlay: document.getElementById("event-detail-overlay"),
  eventDetailTitle: document.getElementById("event-detail-title"),
  eventDetailSubtitle: document.getElementById("event-detail-subtitle"),
  eventDetailBody: document.getElementById("event-detail-body"),
  eventDetailClose: document.getElementById("event-detail-close"),
};

const persisted = vscode.getState() || {};
const browserLocale = typeof navigator !== "undefined" && navigator.language?.startsWith("it") ? "it" : "en";
export const local = {
  locale: persisted.locale === "it" || persisted.locale === "en" ? persisted.locale : browserLocale,
  range: persisted.range || "billingCycle",
  usageFilter: persisted.usageFilter || "all",
  metric: persisted.metric || "tokens",
  sortKey: persisted.sortKey || "timestamp",
  sortOrder: persisted.sortOrder || "desc",
  breakdownSortKey: persisted.breakdownSortKey || "totalTokens",
  breakdownSortOrder: persisted.breakdownSortOrder || "desc",
  sectionOpen: {
    usage: persisted.sectionOpen?.usage !== false,
    pool: persisted.sectionOpen?.pool !== false,
    breakdown: persisted.sectionOpen?.breakdown !== false,
    events: persisted.sectionOpen?.events !== false,
  },
  eventsPage: Math.max(1, persisted.eventsPage || 1),
  eventsPageSize: EVENTS_PAGE_SIZES.includes(persisted.eventsPageSize)
    ? persisted.eventsPageSize
    : DEFAULT_EVENTS_PAGE_SIZE,
};

export const refs = {
  state: null,
  chart: null,
  poolChart: null,
  poolPaceChart: null,
  selectedEventIdx: null,
};

export function setState(next) {
  refs.state = next;
}

export function setChart(next) {
  if (refs.chart) {
    refs.chart.destroy();
  }
  refs.chart = next;
}

export function setPoolChart(next) {
  if (refs.poolChart) {
    refs.poolChart.destroy();
  }
  refs.poolChart = next;
}

export function setPoolPaceChart(next) {
  if (refs.poolPaceChart) {
    refs.poolPaceChart.destroy();
  }
  refs.poolPaceChart = next;
}

export function setSelectedEventIdx(next) {
  refs.selectedEventIdx = next;
}

export const TOKEN_COLORS = {
  input: "#9ec5fe",
  output: "#b6e3c1",
  cacheWrite: "#f7c5a0",
  cacheRead: "#d3b9f2",
};

export const PALETTE = [
  "#9ec5fe",
  "#b6e3c1",
  "#f7c5a0",
  "#d3b9f2",
  "#f5b8c5",
  "#a7e0e0",
  "#f0d99b",
  "#c9d4f0",
];

export function persistLocal() {
  vscode.setState({
    locale: local.locale,
    range: local.range,
    usageFilter: local.usageFilter,
    metric: local.metric,
    sortKey: local.sortKey,
    sortOrder: local.sortOrder,
    breakdownSortKey: local.breakdownSortKey,
    breakdownSortOrder: local.breakdownSortOrder,
    sectionOpen: local.sectionOpen,
    eventsPage: local.eventsPage,
    eventsPageSize: local.eventsPageSize,
  });
}

export function resetEventsPage() {
  local.eventsPage = 1;
  persistLocal();
}

export function paginateList(items, page, pageSize) {
  const safePageSize = Math.max(1, pageSize);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);
  return {
    items: items.slice(startIndex, endIndex),
    totalItems,
    totalPages,
    page: safePage,
    pageSize: safePageSize,
    startIndex,
    endIndex,
  };
}

function setSectionCollapsed(section, isOpen) {
  const sectionEl = document.querySelector('.collapsible-section[data-section="' + section + '"]');
  const bodyEl = document.getElementById("section-body-" + section);
  const toggleEl = document.querySelector('.section-toggle[data-toggle-section="' + section + '"]');
  if (!sectionEl || !bodyEl || !toggleEl) return;
  sectionEl.classList.toggle("collapsed", !isOpen);
  bodyEl.classList.toggle("hidden", !isOpen);
  toggleEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

export function applySectionState() {
  setSectionCollapsed("usage", local.sectionOpen.usage);
  setSectionCollapsed("pool", local.sectionOpen.pool);
  setSectionCollapsed("breakdown", local.sectionOpen.breakdown);
  setSectionCollapsed("events", local.sectionOpen.events);
}
