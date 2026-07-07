import type { UsagePayload } from "./cursor-api";
import type { DashboardCurrency, DashboardLocale } from "./dashboard-locale";
import { formatOnDemandStatus } from "./currency-format";
import { t, tf } from "./i18n";
import type { PoolDayPace } from "./pool-usage-series";

type ProgressBarRenderer = {
  html: (ratio: number) => string;
};

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function formatStatusBarUsageText(
  data: Pick<UsagePayload, "includedRequests" | "onDemand" | "poolUsage">,
  opts: {
    onDemandVisible: boolean;
    currency?: DashboardCurrency;
    locale?: DashboardLocale;
  },
): string {
  const currency = opts.currency ?? "usd";
  const locale = opts.locale ?? "en";
  const parts = [`${data.includedRequests.used}/${data.includedRequests.limit}`];

  if (data.poolUsage) {
    parts.push(`${formatPercent(data.poolUsage.autoPercentUsed)}% Auto`);
    parts.push(`${formatPercent(data.poolUsage.apiPercentUsed)}% API`);
  }

  if (opts.onDemandVisible) {
    parts.push(
      formatOnDemandStatus(
        data.onDemand.spendDollars,
        data.onDemand.limitDollars,
        data.onDemand.state,
        currency,
        locale,
      ),
    );
  }

  return parts.join(", ");
}

export function buildPoolUsageMarkdown(
  poolUsage: NonNullable<UsagePayload["poolUsage"]>,
  renderProgressBar: ProgressBarRenderer,
  locale: DashboardLocale,
): string {
  const autoRatio = Math.min(Math.max(poolUsage.autoPercentUsed / 100, 0), 1);
  const apiRatio = Math.min(Math.max(poolUsage.apiPercentUsed / 100, 0), 1);

  return [
    `<table width="100%" cellspacing="0" cellpadding="0">`,
    `  <tr><td colspan="2"><sub>${t(locale, "includedPool")}</sub></td></tr>`,
    `  <tr><td colspan="2"><strong>${tf(locale, "totalUsed", { pct: formatPercent(poolUsage.totalPercentUsed) })}</strong></td></tr>`,
    `  <tr>`,
    `    <td width="18%"><sub>Auto</sub></td>`,
    `    <td><sub>${formatPercent(poolUsage.autoPercentUsed)}%</sub> ${renderProgressBar.html(autoRatio)}</td>`,
    `  </tr>`,
    `  <tr>`,
    `    <td><sub>API</sub></td>`,
    `    <td><sub>${formatPercent(poolUsage.apiPercentUsed)}%</sub> ${renderProgressBar.html(apiRatio)}</td>`,
    `  </tr>`,
    `</table>`,
    ``,
  ].join("\n");
}

export function buildPoolTodayPaceMarkdown(
  autoPace: PoolDayPace | null,
  apiPace: PoolDayPace | null,
  renderProgressBar: ProgressBarRenderer,
  locale: DashboardLocale,
): string {
  if (!autoPace && !apiPace) return "";

  const rows: string[] = [];
  for (const [label, pace] of [["Auto", autoPace], ["API", apiPace]] as const) {
    if (!pace) continue;
    const usedRatio = pace.allowance > 0 ? Math.min(pace.used / pace.allowance, 1) : 0;
    rows.push(
      `  <tr>`,
      `    <td width="18%"><sub>${label}</sub></td>`,
      `    <td><sub>${tf(locale, "budgetPct", { pct: formatPercent(pace.allowance) })}</sub> ${renderProgressBar.html(usedRatio)} <sub>${formatBudgetStatus(pace, locale)}</sub></td>`,
      `  </tr>`,
    );
  }

  return [
    `<table width="100%" cellspacing="0" cellpadding="0">`,
    `  <tr><td colspan="2"><sub>${t(locale, "dailyBudget")}</sub></td></tr>`,
    `  <tr><td colspan="2"><sub>${t(locale, "evenSpreadUntilReset")}</sub></td></tr>`,
    ...rows,
    `</table>`,
    ``,
  ].join("\n");
}

function formatBudgetStatus(pace: PoolDayPace, locale: DashboardLocale): string {
  if (Math.abs(pace.residual) < 0.05) return t(locale, "onBudget");
  if (pace.residual > 0) return tf(locale, "leftToday", { pct: formatPercent(pace.residual) });
  return tf(locale, "overBudget", { pct: formatPercent(Math.abs(pace.residual)) });
}
