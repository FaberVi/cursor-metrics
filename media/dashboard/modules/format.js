import { DAY_MS, local, refs, ui } from "./core.js";
import { getDateLocale, t } from "./i18n.js";

export function startOfUtcDay(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function getDurationCutoff(range, resetAtIso, now) {
  if (range === "billingCycle") {
    if (!resetAtIso) return now - 31 * DAY_MS;
    const reset = new Date(resetAtIso);
    if (Number.isNaN(reset.getTime())) return now - 31 * DAY_MS;
    reset.setMonth(reset.getMonth() - 1);
    return reset.getTime();
  }
  const map = { "1d": 1, "7d": 7, "30d": 30 };
  return now - (map[range] || 30) * DAY_MS;
}

export function matchesUsageFilter(event, filter) {
  if (filter === "all") return true;
  if (filter === "included") return event.kind === "Included";
  return event.kind === "On-Demand";
}

export function formatTokens(n) {
  const trim = (v) => {
    const s = v.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };
  if (n >= 1e9) return trim(n / 1e9) + "B";
  if (n >= 1e6) return trim(n / 1e6) + "M";
  if (n >= 1e3) return trim(n / 1e3) + "K";
  return String(Math.round(n));
}

export function formatDollars(n) {
  return "$" + (n || 0).toFixed(2);
}

export function toMillis(ts) {
  if (typeof ts === "number") return ts;
  if (typeof ts === "string" && ts !== "") {
    const n = Number(ts);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function formatDateTime(ts) {
  const d = new Date(toMillis(ts));
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatFullDateTime(ts) {
  const d = new Date(toMillis(ts));
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTokenCount(n) {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

export function formatCents(cents) {
  if (!Number.isFinite(cents) || cents === 0) return "$0.00";
  const dollars = cents / 100;
  return "$" + dollars.toFixed(dollars >= 1 ? 2 : 4);
}

export function tokenField(event, key) {
  return event[key] || 0;
}

export function pctOf(part, total) {
  if (!total) return "0%";
  return formatPercent((part / total) * 100) + "%";
}

export function ratioText(numerator, denominator) {
  if (!denominator) return "\u2014";
  return formatPercent((numerator / denominator) * 100) + "%";
}

export function formatRequests(n) {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(1);
}

export function isOnDemandEvent(event) {
  return event.kind === "On-Demand";
}

export function isIncludedEvent(event) {
  return event.kind === "Included";
}

export function eventSpendDollars(event) {
  if (refs.state && refs.state.quotaAwareEventDisplay && !isOnDemandEvent(event)) return 0;
  return (event.spendCents || 0) / 100;
}

export function eventRequestsText(event) {
  if (refs.state && refs.state.quotaAwareEventDisplay && !isIncludedEvent(event)) return "\u2014";
  return formatRequests(event.requests || 0);
}

export function eventSpendText(event) {
  if (refs.state && refs.state.quotaAwareEventDisplay && !isOnDemandEvent(event)) return "\u2014";
  return formatDollars(eventSpendDollars(event));
}

export function formatDayLabel(dayMs) {
  return new Date(dayMs).toLocaleDateString(getDateLocale(), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatResetCountdown(iso) {
  if (!iso) return "";
  const reset = new Date(iso);
  const days = Math.max(0, Math.ceil((reset.getTime() - Date.now()) / DAY_MS));
  const formatted = reset.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric", year: "numeric" });
  if (local.locale === "it") {
    return "Reset tra " + days + (days === 1 ? " giorno" : " giorni") + " il " + formatted;
  }
  return "Resets in " + days + " day" + (days === 1 ? "" : "s") + " on " + formatted;
}

export function setActiveRangeButton() {
  ui.rangeSelector.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === local.range);
  });
}

export function formatModelLabel(model) {
  if (model === "default") return "Auto";
  return model;
}

export function formatPercent(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function rangeLabel() {
  if (local.range === "1d") return t("range1d");
  if (local.range === "7d") return t("range7d");
  if (local.range === "30d") return t("range30d");
  return t("rangeBilling");
}
