import { refs, ui } from "./core.js";
import { cardHelpText, getDateLocale, t } from "./i18n.js";
import {
  escapeHtml,
  formatDollars,
  formatPercent,
  formatResetCountdown,
} from "./format.js";

function renderPlanBanner() {
  if (!ui.planBanner) return;
  const planInfo = refs.state?.data?.planInfo;
  if (!planInfo) {
    ui.planBanner.innerHTML = "";
    ui.planBanner.classList.add("hidden");
    return;
  }

  const badgeLabel = planInfo.planKind === "enterprise"
    ? t("enterprise")
    : planInfo.accountType === "team"
      ? t("teams")
      : t("personal");
  const badgeClass = planInfo.accountType === "team" ? "plan-badge-team" : "plan-badge-personal";
  ui.planBanner.classList.remove("hidden");
  ui.planBanner.innerHTML =
    '<div class="plan-banner-inner">' +
      '<span class="plan-kicker muted">' + escapeHtml(t("currentPlan")) + "</span>" +
      '<div class="plan-banner-title">' +
        '<span class="plan-badge ' + badgeClass + '">' + escapeHtml(badgeLabel) + "</span>" +
        '<span class="plan-tier">' + escapeHtml(planInfo.tier) + "</span>" +
        (planInfo.priceLabel
          ? '<span class="plan-price muted">' + escapeHtml(planInfo.priceLabel) + "</span>"
          : "") +
      "</div>" +
      '<span class="plan-caption muted">' + escapeHtml(planInfo.displayName) + "</span>" +
    "</div>";
}

function cardHelpButton(helpKey) {
  const text = cardHelpText(helpKey);
  if (!text) return "";
  return (
    '<span class="card-help-wrap">' +
      '<button type="button" class="card-help" aria-label="More info about this metric">?</button>' +
      '<span class="card-help-tooltip" role="tooltip">' + escapeHtml(text) + "</span>" +
    "</span>"
  );
}

function cardLabel(title, helpKey) {
  return '<div class="card-label">' + escapeHtml(title) + cardHelpButton(helpKey) + "</div>";
}

function formatProjectionDate(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric", year: "numeric" });
}

function renderDepletionLine(label, projection, resetAtIso) {
  if (!projection) return "";
  const avg = formatPercent(projection.avgDailyPercent) + t("perDay");

  if (projection.status === "exhausted") {
    return (
      '<div class="pool-projection-row">' +
        '<span class="pool-projection-label">' + escapeHtml(label) + "</span>" +
        '<span class="pool-projection-value exhausted">' + escapeHtml(t("alreadyExhausted")) + "</span>" +
        '<span class="pool-projection-avg muted">' + escapeHtml(avg) + "</span>" +
      "</div>"
    );
  }

  if (projection.status === "no_usage") {
    return (
      '<div class="pool-projection-row">' +
        '<span class="pool-projection-label">' + escapeHtml(label) + "</span>" +
        '<span class="pool-projection-value muted">' + escapeHtml(t("noUsageYet")) + "</span>" +
      "</div>"
    );
  }

  let valueText = "~" + formatProjectionDate(projection.projectedAtIso);
  if (projection.status === "after_reset") {
    const resetText = resetAtIso ? formatProjectionDate(resetAtIso) : t("rangeBilling");
    valueText = resetText + " (" + formatProjectionDate(projection.projectedAtIso) + ")";
  }

  return (
    '<div class="pool-projection-row">' +
      '<span class="pool-projection-label">' + escapeHtml(label) + "</span>" +
      '<span class="pool-projection-value">' + escapeHtml(valueText) + "</span>" +
      '<span class="pool-projection-avg muted">' + escapeHtml(avg) + "</span>" +
    "</div>"
  );
}

function renderTodayPaceRow(label, pace) {
  if (!pace) return "";
  const { allowance, used, residual } = pace;
  const maxScale = Math.max(allowance, used, 0.01);
  const usedWidth = (used / maxScale) * 100;
  const allowanceWidth = Math.min((allowance / maxScale) * 100, 100);
  const underWidth = residual > 0 ? (residual / maxScale) * 100 : 0;
  const overWidth = residual < 0 ? (Math.abs(residual) / maxScale) * 100 : 0;

  let statusText;
  let statusClass;
  if (residual > 0.05) {
    statusText = formatPercent(residual) + "% " + t("leftToday");
    statusClass = "under";
  } else if (residual < -0.05) {
    statusText = formatPercent(Math.abs(residual)) + "% " + t("overPace");
    statusClass = "over";
  } else {
    statusText = t("onPace");
    statusClass = "on-budget";
  }

  return (
    '<div class="pool-pace-row">' +
      '<span class="pool-pace-label">' + escapeHtml(label) + "</span>" +
      '<div class="pool-pace-bar" title="Budget ' + formatPercent(allowance) + '%, used ' + formatPercent(used) + '%">' +
        '<div class="pool-pace-track">' +
          '<div class="pool-pace-used" style="width:' + usedWidth + '%"></div>' +
          (underWidth > 0 ? '<div class="pool-pace-residual" style="width:' + underWidth + '%"></div>' : "") +
          (overWidth > 0 ? '<div class="pool-pace-over" style="width:' + overWidth + '%"></div>' : "") +
          '<div class="pool-pace-marker" style="left:' + allowanceWidth + '%"></div>' +
        "</div>" +
      "</div>" +
      '<span class="pool-pace-status ' + statusClass + '">' + escapeHtml(statusText) + "</span>" +
    "</div>"
  );
}

function renderTodayPace(poolSeries) {
  if (!poolSeries?.todayAutoPace && !poolSeries?.todayApiPace) return "";
  return (
    '<div class="pool-pace">' +
      '<div class="pool-projection-title">' +
        cardHelpButton("poolPace") +
        "<span>" + escapeHtml(t("todayPace")) + "</span>" +
      "</div>" +
      renderTodayPaceRow("Auto", poolSeries.todayAutoPace) +
      renderTodayPaceRow("API", poolSeries.todayApiPace) +
    "</div>"
  );
}

function renderRecommendedPace(poolUsage, poolRecommended) {
  if (!poolRecommended) return "";
  const autoRec = Math.min(Math.max(poolRecommended.autoRecommended, 0), 100);
  const apiRec = Math.min(Math.max(poolRecommended.apiRecommended, 0), 100);
  const autoUsed = Math.min(Math.max(poolUsage.autoPercentUsed, 0), 100);
  const apiUsed = Math.min(Math.max(poolUsage.apiPercentUsed, 0), 100);

  function row(label, recPct, usedPct) {
    return (
      '<div class="pool-row pool-row-recommended">' +
        '<span class="pool-label">' + escapeHtml(label) + "</span>" +
        '<div class="progress pool-progress pool-progress-recommended"><div style="width:' + recPct + '%"></div></div>' +
        '<span class="pool-pct">' + formatPercent(recPct) + "% " + escapeHtml(t("recTarget")) + "</span>" +
      "</div>" +
      '<div class="pool-row pool-row-used-compare">' +
        '<span class="pool-label"></span>' +
        '<span class="pool-used-compare muted">' + escapeHtml(t("usedLabel")) + " " + formatPercent(usedPct) + "%</span>" +
      "</div>"
    );
  }

  return (
    '<div class="pool-recommended">' +
      '<div class="pool-projection-title">' +
        cardHelpButton("poolRecommended") +
        "<span>" + escapeHtml(t("recommendedPace")) + "</span>" +
      "</div>" +
      '<p class="muted small pool-recommended-desc">' + escapeHtml(t("recommendedPaceDesc")) + "</p>" +
      row("Auto", autoRec, autoUsed) +
      row("API", apiRec, apiUsed) +
    "</div>"
  );
}

function renderPoolUsageCard(poolUsage, poolDepletion, resetAtIso, poolSeries, poolRecommended) {
  const autoPct = Math.min(Math.max(poolUsage.autoPercentUsed, 0), 100);
  const apiPct = Math.min(Math.max(poolUsage.apiPercentUsed, 0), 100);
  const totalPct = Math.min(Math.max(poolUsage.totalPercentUsed, 0), 100);
  const projections = poolDepletion
    ? renderDepletionLine("Auto", poolDepletion.auto, resetAtIso) +
      renderDepletionLine("API", poolDepletion.api, resetAtIso)
    : "";

  return (
    '<div class="card">' +
      cardLabel(t("includedPool"), "includedPool") +
      '<div class="card-value">' + formatPercent(totalPct) + "% " + escapeHtml(t("totalUsed")) + "</div>" +
      '<div class="pool-rows">' +
        '<div class="pool-row">' +
          '<span class="pool-label">Auto</span>' +
          '<div class="progress pool-progress"><div style="width:' + autoPct + '%"></div></div>' +
          '<span class="pool-pct">' + formatPercent(autoPct) + "%</span>" +
        "</div>" +
        '<div class="pool-row">' +
          '<span class="pool-label">API</span>' +
          '<div class="progress pool-progress"><div style="width:' + apiPct + '%"></div></div>' +
          '<span class="pool-pct">' + formatPercent(apiPct) + "%</span>" +
        "</div>" +
      "</div>" +
      renderRecommendedPace(poolUsage, poolRecommended) +
      (projections
        ? '<div class="pool-projection">' +
            '<div class="pool-projection-title">' +
              cardHelpButton("poolDepletion") +
              '<span>' + escapeHtml(t("projectedPace")) + "</span>" +
            "</div>" +
            projections +
          "</div>"
        : "") +
      renderTodayPace(poolSeries) +
    "</div>"
  );
}

export function renderSummaryCards() {
  renderPlanBanner();
  if (!refs.state || !refs.state.data) {
    ui.summaryCards.innerHTML = '<div class="card"><div class="card-label">' + escapeHtml(t("noData")) + "</div></div>";
    return;
  }
  const { includedRequests, onDemand } = refs.state.data;
  const reqRatio = includedRequests.limit > 0 ? Math.min(1, includedRequests.used / includedRequests.limit) : 0;
  const reqPct = Math.round(reqRatio * 100);

  const parts = [];
  parts.push(
    '<div class="card">' +
      cardLabel(t("includedRequests"), "includedRequests") +
      '<div class="card-value">' + includedRequests.used + " / " + includedRequests.limit + "</div>" +
      '<div class="progress"><div style="width:' + (reqPct) + '%"></div></div>' +
      '<div class="card-footer">' + formatResetCountdown(refs.state.resetsAt) + "</div>" +
    "</div>"
  );

  if (onDemand.state !== "disabled") {
    let valText, footerText, ratio;
    if (onDemand.state === "unlimited") {
      valText = formatDollars(onDemand.spendDollars);
      footerText = t("unlimited");
      ratio = 0;
    } else {
      valText = formatDollars(onDemand.spendDollars) + " / " + formatDollars(onDemand.limitDollars || 0);
      ratio = onDemand.limitDollars > 0 ? Math.min(1, onDemand.spendDollars / onDemand.limitDollars) : 0;
      footerText = t("onDemandFooter");
    }
    parts.push(
      '<div class="card">' +
        cardLabel(t("onDemandUsage"), "onDemand") +
        '<div class="card-value">' + valText + "</div>" +
        '<div class="progress"><div style="width:' + Math.round(ratio * 100) + '%"></div></div>' +
        '<div class="card-footer">' + footerText + "</div>" +
      "</div>"
    );
  }
  if (refs.state.data.poolUsage) {
    parts.push(renderPoolUsageCard(
      refs.state.data.poolUsage,
      refs.state.poolDepletion,
      refs.state.resetsAt,
      refs.state.poolUsageSeries,
      refs.state.poolRecommended,
    ));
  }

  ui.summaryCards.innerHTML = parts.join("");
  ui.summaryCards.classList.toggle("has-pool-card", Boolean(refs.state.data.poolUsage));
}
