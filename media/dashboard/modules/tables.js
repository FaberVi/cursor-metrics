import {
  EVENTS_PAGE_SIZES,
  local,
  paginateList,
  persistLocal,
  refs,
  setSelectedEventIdx,
  TOKEN_COLORS,
  ui,
} from "./core.js";
import { colorForModel, tintColor } from "./chart.js";
import {
  escapeHtml,
  eventRequestsText,
  eventSpendDollars,
  eventSpendText,
  formatCents,
  formatDateTime,
  formatDollars,
  formatFullDateTime,
  formatModelLabel,
  formatRequests,
  formatTokenCount,
  formatTokens,
  getDurationCutoff,
  isIncludedEvent,
  isOnDemandEvent,
  matchesUsageFilter,
  pctOf,
  rangeLabel,
  ratioText,
  toMillis,
  tokenField,
} from "./format.js";

export function getSortedEvents() {
  if (!refs.state) return [];
  const cutoff = getDurationCutoff(local.range, refs.state.resetsAt, refs.state.generatedAt);
  const events = refs.state.events.filter((e) => {
    const ts = toMillis(e.timestamp);
    return Number.isFinite(ts) && ts >= cutoff && matchesUsageFilter(e, local.usageFilter);
  });
  const dir = local.sortOrder === "asc" ? 1 : -1;
  const key = local.sortKey;
  return events.slice().sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === "timestamp") { av = toMillis(av); bv = toMillis(bv); }
    const an = typeof av === "number" ? av : Number(av);
    const bn = typeof bv === "number" ? bv : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

function renderEventRow(e, eventIdx) {
  const maxBadge = e.maxMode ? ' <span class="max-badge">MAX</span>' : "";
  const color = colorForModel(e.model);
  const rowStyle = 'background:' + tintColor(color, 0.10) + ';box-shadow:inset 3px 0 0 ' + color + ';';
  const selected = refs.selectedEventIdx === eventIdx ? " event-row-selected" : "";
  return '<tr class="event-row-clickable' + selected + '" data-event-idx="' + eventIdx + '" style="' + rowStyle + '" title="Click for token breakdown">' +
    "<td>" + formatDateTime(e.timestamp) + "</td>" +
    '<td><span class="kind-badge kind-' + e.kind.replace(/[^A-Za-z]/g, "") + '">' + e.kind + "</span></td>" +
    "<td>" + escapeHtml(formatModelLabel(e.model)) + maxBadge + "</td>" +
    '<td class="num">' + formatTokens(e.totalTokens || 0) + "</td>" +
    '<td class="num">' + eventRequestsText(e) + "</td>" +
    '<td class="num">' + eventSpendText(e) + "</td>" +
  "</tr>";
}

function renderTokenBreakdown(event) {
  const input = tokenField(event, "inputTokens");
  const output = tokenField(event, "outputTokens");
  const cacheWrite = tokenField(event, "cacheWriteTokens");
  const cacheRead = tokenField(event, "cacheReadTokens");
  const total = event.totalTokens || input + output + cacheWrite + cacheRead;
  const segments = [
    { key: "input", label: "Input", value: input, color: TOKEN_COLORS.input },
    { key: "output", label: "Output", value: output, color: TOKEN_COLORS.output },
    { key: "cacheWrite", label: "Cache write", value: cacheWrite, color: TOKEN_COLORS.cacheWrite },
    { key: "cacheRead", label: "Cache read", value: cacheRead, color: TOKEN_COLORS.cacheRead },
  ].filter((s) => s.value > 0);

  if (total === 0) {
    return '<p class="muted small">No token breakdown available for this event.</p>';
  }

  const bar = segments.map((s) =>
    '<span class="token-bar-seg" style="width:' + ((s.value / total) * 100).toFixed(2) + '%;background:' + s.color + ';" title="' + s.label + ': ' + formatTokenCount(s.value) + '"></span>'
  ).join("");

  const rows = segments.map((s) =>
    '<div class="token-row">' +
      '<span class="token-dot" style="background:' + s.color + ';"></span>' +
      "<span>" + s.label + "</span>" +
      '<span class="count">' + formatTokenCount(s.value) + "</span>" +
      '<span class="pct">' + pctOf(s.value, total) + "</span>" +
    "</div>"
  ).join("");

  return '<div class="token-bar">' + bar + '</div><div class="token-rows">' + rows + "</div>";
}

function renderEventDetailMetrics(event) {
  const input = tokenField(event, "inputTokens");
  const output = tokenField(event, "outputTokens");
  const cacheWrite = tokenField(event, "cacheWriteTokens");
  const cacheRead = tokenField(event, "cacheReadTokens");
  const total = event.totalTokens || 0;
  const requests = event.requests || 0;
  const spend = eventSpendDollars(event);
  const spendCents = Math.round(spend * 100);
  const promptSide = input + cacheWrite + cacheRead;

  const items = [
    ["Output / input", ratioText(output, input)],
    ["Cache read share", pctOf(cacheRead, promptSide)],
    ["Tokens / request", requests ? formatTokenCount(total / requests) : "\u2014"],
  ];
  if (spendCents > 0 && total > 0) {
    items.push(["Cost / 1M tokens", formatCents((spendCents / total) * 1_000_000)]);
  }
  if (spendCents > 0 && requests > 0) {
    items.push(["Cost / request", formatCents(spendCents / requests)]);
  }

  return items.map(([label, value]) => "<dt>" + label + "</dt><dd>" + value + "</dd>").join("");
}

function renderEventDetailCost(event) {
  const showSpend = !refs.state || !refs.state.quotaAwareEventDisplay || isOnDemandEvent(event);
  const tokenCost = event.tokenCostCents || 0;
  const fee = event.cursorTokenFee || 0;
  const charged = event.spendCents || 0;
  const rows = [];

  if (showSpend) {
    if (tokenCost > 0) rows.push(["Model token cost", formatCents(tokenCost)]);
    if (fee > 0) rows.push(["Cursor token fee", formatCents(fee)]);
    rows.push(["Total charged", formatCents(charged)]);
  } else {
    rows.push(["Billing", "Included in plan"]);
    if (tokenCost > 0) rows.push(["Token value (est.)", formatCents(tokenCost)]);
  }

  return rows.map(([label, value]) => "<dt>" + label + "</dt><dd>" + value + "</dd>").join("");
}

function renderEventDetailFlags(event) {
  const flags = [
    { label: "Token-based", on: !!event.isTokenBasedCall },
    { label: "Headless agent", on: !!event.isHeadless },
    { label: "Chargeable", on: !!event.isChargeable },
    { label: "Max mode", on: !!event.maxMode },
  ];
  return flags.map((f) =>
    '<span class="detail-flag' + (f.on ? " on" : "") + '">' + f.label + "</span>"
  ).join("");
}

export function showEventDetail(event, eventIdx) {
  if (!ui.eventDetailOverlay || !ui.eventDetailBody) return;
  setSelectedEventIdx(eventIdx);
  renderTable();

  const maxBadge = event.maxMode ? ' <span class="max-badge">MAX</span>' : "";
  ui.eventDetailTitle.innerHTML = escapeHtml(formatModelLabel(event.model)) + maxBadge;
  ui.eventDetailSubtitle.textContent = formatFullDateTime(event.timestamp);

  ui.eventDetailBody.innerHTML =
    '<div class="event-detail-grid">' +
      '<div class="event-detail-stat"><span class="label">Total tokens</span><span class="value">' + formatTokenCount(event.totalTokens || 0) + "</span></div>" +
      '<div class="event-detail-stat"><span class="label">Requests</span><span class="value">' + eventRequestsText(event) + "</span></div>" +
      '<div class="event-detail-stat"><span class="label">Spend</span><span class="value">' + eventSpendText(event) + "</span></div>" +
    "</div>" +
    '<div class="event-detail-section"><h3>Token breakdown</h3>' + renderTokenBreakdown(event) + "</div>" +
    '<div class="event-detail-section"><h3>Efficiency</h3><dl class="detail-kv">' + renderEventDetailMetrics(event) + "</dl></div>" +
    '<div class="event-detail-section"><h3>Cost</h3><dl class="detail-kv">' + renderEventDetailCost(event) + "</dl></div>" +
    '<div class="event-detail-section"><h3>Details</h3><div class="detail-flags">' + renderEventDetailFlags(event) + "</div>" +
    '<dl class="detail-kv" style="margin-top:8px;"><dt>Type</dt><dd>' + escapeHtml(event.kind) + "</dd>" +
    "<dt>Model ID</dt><dd>" + escapeHtml(event.model) + "</dd></dl></div>";

  ui.eventDetailOverlay.classList.remove("hidden");
  ui.eventDetailOverlay.setAttribute("aria-hidden", "false");
  ui.eventDetailClose?.focus();
}

export function closeEventDetail() {
  if (!ui.eventDetailOverlay) return;
  setSelectedEventIdx(null);
  ui.eventDetailOverlay.classList.add("hidden");
  ui.eventDetailOverlay.setAttribute("aria-hidden", "true");
  renderTable();
}

function renderPagination(paged) {
  if (paged.totalItems === 0) {
    ui.pagination.innerHTML = "";
    return;
  }

  const showingStart = paged.startIndex + 1;
  const showingEnd = paged.endIndex;
  const sizeOptions = EVENTS_PAGE_SIZES.map((size) =>
    '<option value="' + size + '"' + (size === local.eventsPageSize ? " selected" : "") + ">" + size + "/page</option>"
  ).join("");
  const atFirst = paged.page <= 1;
  const atLast = paged.page >= paged.totalPages;

  ui.pagination.innerHTML =
    '<span class="pagination-info">Showing ' +
      showingStart.toLocaleString() + "\u2013" + showingEnd.toLocaleString() +
      " of " + paged.totalItems.toLocaleString() + " event" + (paged.totalItems === 1 ? "" : "s") +
    "</span>" +
    '<div class="pagination-controls">' +
      '<select id="events-page-size" class="pagination-size" aria-label="Events per page">' + sizeOptions + "</select>" +
      '<button type="button" data-action="first"' + (atFirst ? " disabled" : "") + ' aria-label="First page">\u00ab</button>' +
      '<button type="button" data-action="prev"' + (atFirst ? " disabled" : "") + ' aria-label="Previous page">\u2039</button>' +
      '<span class="pagination-page">' + paged.page + " / " + paged.totalPages + "</span>" +
      '<button type="button" data-action="next"' + (atLast ? " disabled" : "") + ' aria-label="Next page">\u203a</button>' +
      '<button type="button" data-action="last"' + (atLast ? " disabled" : "") + ' aria-label="Last page">\u00bb</button>' +
    "</div>";
}

export function renderTable() {
  const events = getSortedEvents();
  const paged = paginateList(events, local.eventsPage, local.eventsPageSize);

  if (paged.page !== local.eventsPage) {
    local.eventsPage = paged.page;
    persistLocal();
  }

  if (events.length === 0) {
    ui.tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px;" class="muted">No events in this range</td></tr>';
    ui.pagination.innerHTML = "";
  } else {
    ui.tableBody.innerHTML = paged.items.map((e, i) => renderEventRow(e, paged.startIndex + i)).join("");
    renderPagination(paged);
  }

  ui.tableHead.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.sort === local.sortKey) {
      th.classList.add(local.sortOrder === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });
}

function aggregateModelBreakdown() {
  if (!refs.state) return [];
  const cutoff = getDurationCutoff(local.range, refs.state.resetsAt, refs.state.generatedAt);
  const map = new Map();
  for (const e of refs.state.events) {
    const ts = toMillis(e.timestamp);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    if (!matchesUsageFilter(e, local.usageFilter)) continue;
    const entry = map.get(e.model) || { model: e.model, requests: 0, totalTokens: 0, spendCents: 0 };
    entry.requests += e.requests || 0;
    entry.totalTokens += e.totalTokens || 0;
    entry.spendCents += Math.round(eventSpendDollars(e) * 100);
    map.set(e.model, entry);
  }
  const rows = Array.from(map.values());
  const dir = local.breakdownSortOrder === "asc" ? 1 : -1;
  const key = local.breakdownSortKey;
  rows.sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  return rows;
}

export function renderBreakdown() {
  if (ui.breakdownRangeLabel) ui.breakdownRangeLabel.textContent = "(" + rangeLabel() + ")";
  const rows = aggregateModelBreakdown();

  if (ui.breakdownHead) {
    ui.breakdownHead.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === local.breakdownSortKey) {
        th.classList.add(local.breakdownSortOrder === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });
  }

  if (rows.length === 0) {
    ui.breakdownBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px;" class="muted">No usage in this range</td></tr>';
    return;
  }
  ui.breakdownBody.innerHTML = rows.map((r) => {
    const color = colorForModel(r.model);
    const rowStyle = 'background:' + tintColor(color, 0.10) + ';box-shadow:inset 3px 0 0 ' + color + ';';
    return '<tr style="' + rowStyle + '">' +
      '<td>' + escapeHtml(formatModelLabel(r.model)) + '</td>' +
      '<td class="num">' + formatRequests(r.requests) + '</td>' +
      '<td class="num">' + formatTokens(r.totalTokens) + '</td>' +
      '<td class="num">' + formatDollars(r.spendCents / 100) + '</td>' +
    '</tr>';
  }).join("");
}

function csvCell(v) {
  const s = String(v);
  const safe = /^\s*[=+\-@]/.test(s) ? "'" + s : s;
  if (/[",\n]/.test(safe)) return '"' + safe.replace(/"/g, '""') + '"';
  return safe;
}

export function exportCsv() {
  const events = getSortedEvents();
  const header = ["Date", "Type", "Model", "MaxMode", "Tokens", "InputTokens", "OutputTokens", "CacheWrite", "CacheRead", "Requests", "SpendUSD", "TokenCostUSD", "CursorFeeUSD"];
  const lines = [header.join(",")];
  for (const e of events) {
    const ts = toMillis(e.timestamp);
    const dateStr = Number.isFinite(ts) ? new Date(ts).toISOString() : "";
    const row = [
      dateStr,
      e.kind,
      formatModelLabel(e.model),
      e.maxMode ? "true" : "false",
      e.totalTokens || 0,
      tokenField(e, "inputTokens"),
      tokenField(e, "outputTokens"),
      tokenField(e, "cacheWriteTokens"),
      tokenField(e, "cacheReadTokens"),
      refs.state && refs.state.quotaAwareEventDisplay && !isIncludedEvent(e) ? "" : (e.requests || 0),
      refs.state && refs.state.quotaAwareEventDisplay && !isOnDemandEvent(e) ? "" : eventSpendDollars(e).toFixed(4),
      ((e.tokenCostCents || 0) / 100).toFixed(4),
      ((e.cursorTokenFee || 0) / 100).toFixed(4),
    ].map(csvCell).join(",");
    lines.push(row);
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cursor-usage-" + local.range + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function applyTeamMemberConstraints() {
  const spendOpt = ui.metricFilter.querySelector('option[value="spend"]');
  if (spendOpt) spendOpt.disabled = false;
}

export function showError(msg) {
  if (msg) {
    ui.errorBanner.textContent = msg;
    ui.errorBanner.classList.remove("hidden");
  } else {
    ui.errorBanner.classList.add("hidden");
  }
}
