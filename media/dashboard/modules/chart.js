import { DAY_MS, local, PALETTE, refs, setChart, ui } from "./core.js";
import { t } from "./i18n.js";
import {
  escapeHtml,
  chartSpendDollars,
  formatBillableSpendCents,
  formatDayLabel,
  formatModelLabel,
  formatPercent,
  formatTokens,
  getDurationCutoff,
  matchesUsageFilter,
  startOfUtcDay,
  stateGeneratedAt,
  toMillis,
} from "./format.js";

function buildChartSeries() {
  const events = Array.isArray(refs.state?.events) ? refs.state.events : [];
  const now = stateGeneratedAt();
  const cutoff = getDurationCutoff(local.range, refs.state?.resetsAt ?? null, now);
  const start = startOfUtcDay(cutoff);
  let end = startOfUtcDay(now);
  if (local.range === "billingCycle" && refs.state?.resetsAt) {
    const reset = new Date(refs.state.resetsAt);
    if (!Number.isNaN(reset.getTime())) {
      const cycleEnd = startOfUtcDay(reset.getTime() - DAY_MS);
      if (cycleEnd > end) end = cycleEnd;
    }
  }
  if (end < start) end = start;
  const days = [];
  for (let d = start; d <= end; d += DAY_MS) days.push(d);
  if (days.length === 0) days.push(end);
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  const perModel = new Map();
  const perModelSpend = new Map();
  const ensureArr = (map, m) => {
    let arr = map.get(m);
    if (!arr) {
      arr = new Array(days.length).fill(0);
      map.set(m, arr);
    }
    return arr;
  };

  for (const e of events) {
    const ts = toMillis(e.timestamp);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    if (!matchesUsageFilter(e, local.usageFilter)) continue;
    const day = startOfUtcDay(ts);
    const idx = dayIndex.get(day);
    if (idx === undefined) continue;
    const spend = chartSpendDollars(e);
    const value = e.totalTokens || 0;
    ensureArr(perModel, e.model)[idx] += value;
    ensureArr(perModelSpend, e.model)[idx] += spend;
  }

  const datasets = [];
  for (const [model, arr] of perModel.entries()) {
    datasets.push({
      model,
      data: arr.slice(),
      spendByDay: (perModelSpend.get(model) || new Array(days.length).fill(0)).slice(),
      total: arr.reduce((a, b) => a + b, 0),
    });
  }
  datasets.sort((a, b) => b.total - a.total);

  return { labels: days.map(formatDayLabel), dayMs: days, datasets };
}

let modelColorMap = new Map();

function rebuildModelColorMap(series) {
  modelColorMap = new Map();
  series.datasets.forEach((d, i) => {
    modelColorMap.set(d.model, PALETTE[i % PALETTE.length]);
  });
}

export function colorForModel(model) {
  return modelColorMap.get(model) || "rgba(255,255,255,0.4)";
}

export function tintColor(color, alpha) {
  if (!color) return "rgba(255,255,255," + alpha + ")";
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", "," + alpha + ")");
  }
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, "rgba($1,$2,$3," + alpha + ")");
  }
  return color;
}

function getOrCreateTooltipEl() {
  let el = document.getElementById("chart-tooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "chart-tooltip";
    el.className = "chart-tooltip";
    document.body.appendChild(el);
  }
  return el;
}

function getPoolDailyForDay(dayMs) {
  const pool = refs.state?.poolUsageSeries;
  if (!pool || !refs.state?.data?.poolUsage) return null;
  const idx = pool.dayMs.indexOf(dayMs);
  if (idx === -1) return null;
  return {
    auto: pool.dailyAutoPercent[idx] || 0,
    api: pool.dailyApiPercent[idx] || 0,
  };
}

function renderExternalTooltip(context, opts) {
  const { chart, tooltip } = context;
  const el = getOrCreateTooltipEl();
  if (tooltip.opacity === 0) {
    el.style.opacity = "0";
    return;
  }

  const dataPoints = (tooltip.dataPoints || [])
    .filter((dp) => (dp.parsed.y || 0) > 0)
    .sort((a, b) => (b.parsed.y || 0) - (a.parsed.y || 0));

  const title = (tooltip.title && tooltip.title[0]) || "";
  const dataIndex = tooltip.dataPoints?.[0]?.dataIndex;
  const chartDayMs = Number.isInteger(dataIndex) ? opts.dayMs?.[dataIndex] : undefined;
  const poolDaily = chartDayMs !== undefined ? getPoolDailyForDay(chartDayMs) : null;
  const metricLabel = t("metricTokens");

  const rows = dataPoints.map((dp) => {
    const ds = dp.dataset;
    const v = dp.parsed.y || 0;
    const spend = ds.spendByDay ? (ds.spendByDay[dp.dataIndex] || 0) : 0;
    const color = ds.backgroundColor || colorForModel(ds.label);
    return (
      '<tr>' +
        '<td><span class="t-dot" style="background:' + color + '"></span>' + escapeHtml(ds.label) + '</td>' +
        '<td class="num">' + formatTokens(v) + '</td>' +
        '<td class="num">' + formatBillableSpendCents(Math.round(spend * 100)) + '</td>' +
      '</tr>'
    );
  }).join("");

  const headerCols =
    '<th>' + escapeHtml(t("colModel")) + '</th>' +
    '<th class="num">' + metricLabel + '</th>' +
    '<th class="num">' + escapeHtml(t("colSpend")) + '</th>';

  const poolSection = poolDaily
    ? '<div class="t-subtitle">' + escapeHtml(t("poolUsageDay")) + "</div>" +
      '<table class="t-table"><tbody>' +
        '<tr><td>' + escapeHtml(t("poolFirstParty")) + '</td><td class="num">' + formatPercent(poolDaily.auto) + "%</td></tr>" +
        '<tr><td>' + escapeHtml(t("poolApi")) + '</td><td class="num">' + formatPercent(poolDaily.api) + "%</td></tr>" +
      "</tbody></table>"
    : "";

  el.innerHTML =
    '<div class="t-title">' + escapeHtml(title) + "</div>" +
    '<table class="t-table"><thead><tr>' + headerCols + '</tr></thead><tbody>' + rows + '</tbody></table>' +
    poolSection;

  const canvasRect = chart.canvas.getBoundingClientRect();
  const tooltipWidth = el.offsetWidth;
  const tooltipHeight = el.offsetHeight;
  const padding = 12;

  let left = canvasRect.left + window.scrollX + tooltip.caretX + padding;
  let top = canvasRect.top + window.scrollY + tooltip.caretY - tooltipHeight / 2;

  if (left + tooltipWidth > canvasRect.right + window.scrollX) {
    left = canvasRect.left + window.scrollX + tooltip.caretX - tooltipWidth - padding;
  }
  const minTop = canvasRect.top + window.scrollY + 4;
  const maxTop = canvasRect.bottom + window.scrollY - tooltipHeight - 4;
  if (top < minTop) top = minTop;
  if (top > maxTop) top = maxTop;

  el.style.left = left + "px";
  el.style.top = top + "px";
  el.style.opacity = "1";
}

export function renderChart() {
  if (!ui.canvas || !refs.state) return;

  let series;
  try {
    series = buildChartSeries();
  } catch (err) {
    if (ui.chartNote) {
      ui.chartNote.textContent = String(err instanceof Error ? err.message : err);
    }
    return;
  }
  rebuildModelColorMap(series);
  const yLabel = t("metricTokens");

  const chartData = {
    labels: series.labels,
    datasets: series.datasets.map((d, i) => ({
      label: formatModelLabel(d.model),
      data: d.data,
      spendByDay: d.spendByDay,
      backgroundColor: PALETTE[i % PALETTE.length],
      borderColor: PALETTE[i % PALETTE.length],
      borderWidth: 0,
      categoryPercentage: 0.7,
      barPercentage: 0.85,
    })),
  };

  const styles = getComputedStyle(document.body);
  const muted = styles.getPropertyValue("--muted").trim() || "rgba(255,255,255,0.55)";
  const grid = styles.getPropertyValue("--border").trim() || "rgba(255,255,255,0.06)";

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    layout: { padding: { top: 8, right: 4, bottom: 0, left: 0 } },
    plugins: {
      legend: {
        position: "bottom",
        align: "center",
        labels: {
          color: muted,
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: "circle",
          font: { size: 11 },
          padding: 12,
        },
      },
      tooltip: {
        enabled: false,
        external: (context) => renderExternalTooltip(context, { dayMs: series.dayMs }),
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: muted, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 },
        grid: { display: false, drawBorder: false },
        border: { display: false },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          color: muted,
          font: { size: 10 },
          callback: (v) => (Number.isFinite(v) ? formatTokens(v) : ""),
        },
        grid: { color: grid, drawBorder: false, drawTicks: false },
        border: { display: false },
        title: { display: false, text: yLabel },
      },
    },
  };

  setChart(new Chart(ui.canvas.getContext("2d"), { type: "bar", data: chartData, options: opts }));
  requestAnimationFrame(() => refs.chart?.resize());
  if (ui.chartNote) ui.chartNote.textContent = "";
}
