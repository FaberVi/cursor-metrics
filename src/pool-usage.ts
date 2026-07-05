import type { UsagePayload } from "./cursor-api";
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
  opts: { onDemandVisible: boolean },
): string {
  const parts = [`${data.includedRequests.used}/${data.includedRequests.limit}`];

  if (data.poolUsage) {
    parts.push(`${formatPercent(data.poolUsage.autoPercentUsed)}% Auto`);
    parts.push(`${formatPercent(data.poolUsage.apiPercentUsed)}% API`);
  }

  if (opts.onDemandVisible) {
    if (data.onDemand.state === "unlimited") {
      parts.push(`$${data.onDemand.spendDollars.toFixed(2)}`);
    } else {
      parts.push(
        `$${data.onDemand.spendDollars.toFixed(2)}/$${(data.onDemand.limitDollars ?? 0).toFixed(2)}`,
      );
    }
  }

  return parts.join(", ");
}

export function buildPoolUsageMarkdown(
  poolUsage: NonNullable<UsagePayload["poolUsage"]>,
  renderProgressBar: ProgressBarRenderer,
): string {
  const autoRatio = Math.min(Math.max(poolUsage.autoPercentUsed / 100, 0), 1);
  const apiRatio = Math.min(Math.max(poolUsage.apiPercentUsed / 100, 0), 1);

  return [
    `<table width="100%" cellspacing="0" cellpadding="0">`,
    `  <tr><td colspan="2"><sub>Included pool</sub></td></tr>`,
    `  <tr><td colspan="2"><strong>${formatPercent(poolUsage.totalPercentUsed)}% total used</strong></td></tr>`,
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
): string {
  if (!autoPace && !apiPace) return "";

  const rows: string[] = [];
  for (const [label, pace] of [["Auto", autoPace], ["API", apiPace]] as const) {
    if (!pace) continue;
    const usedRatio = pace.allowance > 0 ? Math.min(pace.used / pace.allowance, 1) : 0;
    rows.push(
      `  <tr>`,
      `    <td width="18%"><sub>${label}</sub></td>`,
        `    <td><sub>${formatPercent(pace.allowance)}% budget</sub> ${renderProgressBar.html(usedRatio)} <sub>${formatBudgetStatus(pace)}</sub></td>`,
      `  </tr>`,
    );
  }

  return [
    `<table width="100%" cellspacing="0" cellpadding="0">`,
    `  <tr><td colspan="2"><sub>Daily budget</sub></td></tr>`,
    `  <tr><td colspan="2"><sub>Even spread until reset</sub></td></tr>`,
    ...rows,
    `</table>`,
    ``,
  ].join("\n");
}

function formatBudgetStatus(pace: PoolDayPace): string {
  if (Math.abs(pace.residual) < 0.05) return "On budget";
  if (pace.residual > 0) return `${formatPercent(pace.residual)}% left today`;
  return `${formatPercent(Math.abs(pace.residual))}% over budget`;
}
