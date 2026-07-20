import { local, refs, ui } from "./core.js";
import { colorForModel, tintColor } from "./chart.js";
import {
  escapeHtml,
  eventSpendDollars,
  eventRequestCount,
  formatBillableSpendCents,
  formatCents,
  formatModelLabel,
  formatRequests,
  formatTokens,
  getDurationCutoff,
  matchesUsageFilter,
  rangeLabel,
  stateGeneratedAt,
  toMillis,
} from "./format.js";
import { t } from "./i18n.js";
import { estimateEventTheoreticalCost, resolveModelPricing } from "../../../src/model-pricing.ts";
import { getEstimateOpts } from "./pricing-shared.js";

function aggregateModelBreakdown() {
  if (!refs.state) return [];
  const cutoff = getDurationCutoff(local.range, refs.state.resetsAt, stateGeneratedAt());
  const estimateOpts = getEstimateOpts();
  const map = new Map();
  const events = Array.isArray(refs.state.events) ? refs.state.events : [];
  for (const e of events) {
    const ts = toMillis(e.timestamp);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    if (!matchesUsageFilter(e, local.usageFilter)) continue;
    const entry = map.get(e.model) || {
      model: e.model,
      requests: 0,
      totalTokens: 0,
      spendCents: 0,
      theoreticalCents: 0,
    };
    entry.requests += eventRequestCount(e);
    entry.totalTokens += e.totalTokens || 0;
    entry.spendCents += Math.round(eventSpendDollars(e) * 100);
    const pricing = resolveModelPricing(e.model);
    if (pricing) {
      entry.theoreticalCents += estimateEventTheoreticalCost(e, pricing, estimateOpts).totalCents;
    }
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
  if (!ui.breakdownBody) return;
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
    ui.breakdownBody.innerHTML =
      '<tr><td colspan="5" style="text-align:center; padding:24px;" class="muted">' +
      escapeHtml(t("noUsageInRange")) +
      "</td></tr>";
    if (ui.breakdownFoot) ui.breakdownFoot.innerHTML = "";
    return;
  }
  ui.breakdownBody.innerHTML = rows.map((r) => {
    const color = colorForModel(r.model);
    const rowStyle = 'background:' + tintColor(color, 0.10) + ';box-shadow:inset 3px 0 0 ' + color + ';';
    return '<tr style="' + rowStyle + '">' +
      '<td><button type="button" class="pricing-link-btn" data-pricing-model="' + escapeHtml(r.model) + '" title="' + escapeHtml(t("pricingViewRates")) + '">↗</button> ' + escapeHtml(formatModelLabel(r.model)) + '</td>' +
      '<td class="num">' + formatRequests(r.requests) + '</td>' +
      '<td class="num">' + formatTokens(r.totalTokens) + '</td>' +
      '<td class="num">' + formatBillableSpendCents(r.spendCents) + '</td>' +
      '<td class="num">' + formatCents(r.theoreticalCents) + '</td>' +
    '</tr>';
  }).join("");

  const totals = rows.reduce(
    (acc, r) => {
      acc.requests += r.requests || 0;
      acc.totalTokens += r.totalTokens || 0;
      acc.spendCents += r.spendCents || 0;
      acc.theoreticalCents += r.theoreticalCents || 0;
      return acc;
    },
    { requests: 0, totalTokens: 0, spendCents: 0, theoreticalCents: 0 },
  );
  if (ui.breakdownFoot) {
    ui.breakdownFoot.innerHTML =
      '<tr class="breakdown-total">' +
      '<td>' + escapeHtml(t("total")) + '</td>' +
      '<td class="num">' + formatRequests(totals.requests) + '</td>' +
      '<td class="num">' + formatTokens(totals.totalTokens) + '</td>' +
      '<td class="num">' + formatBillableSpendCents(totals.spendCents) + '</td>' +
      '<td class="num">' + formatCents(totals.theoreticalCents) + '</td>' +
      "</tr>";
  }
}
