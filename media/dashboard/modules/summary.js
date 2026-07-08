import { refs, ui, local } from "./core.js";
import { cardHelpText, getDateLocale, t } from "./i18n.js";
import {
  escapeHtml,
  formatDollars,
  formatPercent,
  formatPlanPriceText,
  formatResetCountdown,
} from "./format.js";

const DAY_MS = 86_400_000;

function getBillingCycleMeta(resetAtIso) {
  if (!resetAtIso) return null;
  const reset = new Date(resetAtIso);
  if (Number.isNaN(reset.getTime())) return null;
  const cycleStart = new Date(resetAtIso);
  cycleStart.setMonth(cycleStart.getMonth() - 1);
  const startMs = cycleStart.getTime();
  const resetMs = reset.getTime();
  const now = Date.now();
  const totalMs = resetMs - startMs;
  if (totalMs <= 0) return null;
  const elapsedMs = Math.max(0, now - startMs);
  const pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const daysLeft = Math.max(0, Math.ceil((resetMs - now) / DAY_MS));
  return { pct, daysLeft, resetMs };
}

function formatBillingCycleValue(daysLeft) {
  if (local.locale === "it") {
    return daysLeft + (daysLeft === 1 ? " giorno" : " giorni");
  }
  return daysLeft + " day" + (daysLeft === 1 ? "" : "s");
}

function renderBillingCycleCard(resetAtIso) {
  const meta = getBillingCycleMeta(resetAtIso);
  if (!meta) {
    return (
      '<div class="card">' +
        cardLabel(t("billingCycle"), "billingCycle") +
        '<div class="card-value muted">' + escapeHtml(t("billingCycleUnknown")) + "</div>" +
      "</div>"
    );
  }

  const resetFormatted = new Date(meta.resetMs).toLocaleDateString(getDateLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const footerText = local.locale === "it"
    ? "Reset il " + resetFormatted + " · " + formatPercent(meta.pct) + "% " + t("cycleElapsed")
    : "Resets " + resetFormatted + " · " + formatPercent(meta.pct) + "% " + t("cycleElapsed");

  return (
    '<div class="card">' +
      cardLabel(t("billingCycle"), "billingCycle") +
      '<div class="card-value">' + escapeHtml(formatBillingCycleValue(meta.daysLeft)) +
        '<span class="card-value-sub muted"> ' + escapeHtml(t("billingCycleUntilReset")) + "</span></div>" +
      '<div class="progress"><div style="width:' + Math.round(meta.pct) + '%"></div></div>' +
      '<div class="card-footer">' + escapeHtml(footerText) + "</div>" +
    "</div>"
  );
}

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
          ? '<span class="plan-price muted">' + escapeHtml(formatPlanPriceText(planInfo.priceLabel)) + "</span>"
          : "") +
      "</div>" +
      '<span class="plan-caption muted">' + escapeHtml(formatPlanPriceText(planInfo.displayName)) + "</span>" +
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
    '<div class="card card-pool">' +
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

function formatOnDemandFooter(onDemand) {
  if (onDemand.onDemandEnabled === false && !onDemand.breakdown) {
    return "Left " + formatDollars(0) + " / " + formatDollars(0);
  }
  const breakdown = onDemand.breakdown;
  if (!breakdown) {
    return onDemand.state === "unlimited" ? t("unlimited") : t("onDemandFooter");
  }
  if (onDemand.onDemandEnabled === false) {
    const leftTotal = "Left " + formatDollars(0) + " / " + formatDollars(0);
    if (breakdown.isTeamPool) {
      return "Team " + formatDollars(breakdown.othersSpendDollars) + " · " + leftTotal;
    }
    return leftTotal;
  }
  if (onDemand.state === "unlimited") {
    if (breakdown.isTeamPool) {
      return "Team " + formatDollars(breakdown.othersSpendDollars) + " · " + t("unlimited");
    }
    return t("unlimited");
  }
  if (onDemand.state !== "limited") return t("onDemandFooter");
  const limit = onDemand.limitDollars || 0;
  const leftTotal = "Left " + formatDollars(breakdown.remainingDollars) + " / " + formatDollars(limit);
  if (breakdown.isTeamPool) {
    return "Team " + formatDollars(breakdown.othersSpendDollars) + " · " + leftTotal;
  }
  return leftTotal;
}

function formatOnDemandValue(onDemand) {
  const mySpend = breakdownMySpend(onDemand);
  if (
    onDemand.state === "unlimited" ||
    onDemand.onDemandEnabled === false ||
    (onDemand.breakdown && onDemand.breakdown.isTeamPool)
  ) {
    return formatDollars(mySpend);
  }
  return formatDollars(mySpend) + " / " + formatDollars(onDemand.limitDollars || 0);
}

function breakdownMySpend(onDemand) {
  if (onDemand.breakdown && typeof onDemand.breakdown.mySpendDollars === "number") {
    return onDemand.breakdown.mySpendDollars;
  }
  return onDemand.spendDollars || 0;
}

function renderOnDemandProgress(onDemand) {
  const limit = onDemand.limitDollars || 0;
  const breakdown = onDemand.breakdown;

  if (onDemand.state === "unlimited" && breakdown) {
    const totalSpend = breakdown.totalSpendDollars || 0;
    if (totalSpend <= 0) {
      return '<div class="progress"><div style="width:0%"></div></div>';
    }
    const youPct = Math.round((breakdown.mySpendDollars / totalSpend) * 100);
    const othersPct = Math.max(0, 100 - youPct);
    return (
      '<div class="progress progress-segmented">' +
        '<div class="progress-you" style="width:' + youPct + '%"></div>' +
        '<div class="progress-others" style="width:' + othersPct + '%"></div>' +
      "</div>"
    );
  }

  if (onDemand.state === "limited") {
    if (limit <= 0) {
      const totalSpend = breakdown
        ? breakdown.totalSpendDollars
        : onDemand.spendDollars || 0;
      if (totalSpend <= 0) {
        return '<div class="progress"><div style="width:0%"></div></div>';
      }
      if (!breakdown) {
        return '<div class="progress"><div style="width:100%"></div></div>';
      }
      const youPct = Math.round((breakdown.mySpendDollars / totalSpend) * 100);
      const othersPct = Math.max(0, 100 - youPct);
      return (
        '<div class="progress progress-segmented">' +
          '<div class="progress-you" style="width:' + youPct + '%"></div>' +
          '<div class="progress-others" style="width:' + othersPct + '%"></div>' +
        "</div>"
      );
    }

    if (!breakdown) {
      const ratio = Math.min(1, breakdownMySpend(onDemand) / limit);
      return '<div class="progress"><div style="width:' + Math.round(ratio * 100) + '%"></div></div>';
    }

    const totalSpend = breakdown.totalSpendDollars || 0;
    const scale = limit > 0 && totalSpend > limit ? totalSpend : limit > 0 ? limit : totalSpend;
    if (scale <= 0) {
      return '<div class="progress"><div style="width:0%"></div></div>';
    }
    const youPct = Math.round((breakdown.mySpendDollars / scale) * 100);
    const othersPct = Math.round((breakdown.othersSpendDollars / scale) * 100);
    return (
      '<div class="progress progress-segmented">' +
        '<div class="progress-you" style="width:' + youPct + '%"></div>' +
        '<div class="progress-others" style="width:' + othersPct + '%"></div>' +
      "</div>"
    );
  }

  return '<div class="progress"><div style="width:0%"></div></div>';
}

export function renderSummaryCards() {
  renderPlanBanner();
  if (!refs.state || !refs.state.data) {
    ui.summaryCards.innerHTML = '<div class="card"><div class="card-label">' + escapeHtml(t("noData")) + "</div></div>";
    return;
  }
  const { includedRequests, onDemand } = refs.state.data;

  const parts = [];

  if (refs.state.showPremiumRequests) {
    const reqRatio = includedRequests.limit > 0 ? Math.min(1, includedRequests.used / includedRequests.limit) : 0;
    const reqPct = Math.round(reqRatio * 100);
    parts.push(
      '<div class="card">' +
        cardLabel(t("includedRequests"), "includedRequests") +
        '<div class="card-value">' + includedRequests.used + " / " + includedRequests.limit + "</div>" +
        '<div class="progress"><div style="width:' + (reqPct) + '%"></div></div>' +
        '<div class="card-footer">' + formatResetCountdown(refs.state.resetsAt) + "</div>" +
      "</div>"
    );
  }

  if (onDemand.state !== "disabled") {
    let valText, footerText, progressHtml;
    if (onDemand.state === "unlimited") {
      valText = formatOnDemandValue(onDemand);
      progressHtml = onDemand.breakdown
        ? renderOnDemandProgress(onDemand)
        : '<div class="progress"><div style="width:0%"></div></div>';
      footerText = formatOnDemandFooter(onDemand);
    } else {
      valText = formatOnDemandValue(onDemand);
      progressHtml = renderOnDemandProgress(onDemand);
      footerText = formatOnDemandFooter(onDemand);
    }
    parts.push(
      '<div class="card">' +
        cardLabel(t("onDemandUsage"), "onDemand") +
        '<div class="card-value">' + valText + "</div>" +
        progressHtml +
        '<div class="card-footer">' + escapeHtml(footerText) + "</div>" +
      "</div>"
    );
  }

  if (refs.state.data.poolUsage && !refs.state.showPremiumRequests) {
    parts.push(renderBillingCycleCard(refs.state.resetsAt));
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
