import { local, refs, ui } from "./core.js";
import {
  eventSpendDollars,
  formatModelLabel,
  getActiveCurrency,
  isIncludedEvent,
  isOnDemandEvent,
  toCsvMoney,
  toMillis,
  tokenField,
} from "./format.js";
import { getSortedEvents } from "./tables-events.js";

function csvCell(v) {
  const s = String(v);
  const safe = /^\s*[=+\-@]/.test(s) ? "'" + s : s;
  if (/[",\n]/.test(safe)) return '"' + safe.replace(/"/g, '""') + '"';
  return safe;
}

export function exportCsv() {
  const events = getSortedEvents();
  const spendCol = getActiveCurrency() === "eur" ? "SpendEUR" : "SpendUSD";
  const tokenCostCol = getActiveCurrency() === "eur" ? "TokenCostEUR" : "TokenCostUSD";
  const feeCol = getActiveCurrency() === "eur" ? "CursorFeeEUR" : "CursorFeeUSD";
  const header = ["Date", "Type", "Model", "MaxMode", "Tokens", "InputTokens", "OutputTokens", "CacheWrite", "CacheRead", "Requests", spendCol, tokenCostCol, feeCol];
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
      refs.state && refs.state.quotaAwareEventDisplay && !isOnDemandEvent(e) ? "" : toCsvMoney(eventSpendDollars(e)),
      toCsvMoney((e.tokenCostCents || 0) / 100),
      toCsvMoney((e.cursorTokenFee || 0) / 100),
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
