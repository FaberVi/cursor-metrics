import { refs, local } from "./core.js";
import { aggregateTheoreticalByModel, formatRateUsd } from "../../../src/model-pricing.ts";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";

export function getPricingState() {
  return refs.state?.modelPricing ?? null;
}

export function isTeamPlan() {
  const tier = refs.state?.data?.planInfo?.tier ?? "";
  return tier === "Teams" || tier === "Enterprise" || tier.startsWith("Teams ·");
}

export function getEstimateOpts() {
  const catalog = getPricingState()?.catalog;
  return {
    applyCursorTokenRate: isTeamPlan(),
    cursorTokenRatePerMillion: catalog?.cursorTokenRatePerMillion ?? 0.25,
  };
}

export function aggregateForRange() {
  if (!refs.state) return { usedModelIds: [], theoreticalByModel: {} };
  return aggregateTheoreticalByModel(
    refs.state.events,
    local.range,
    refs.state.resetsAt,
    refs.state.generatedAt,
    getEstimateOpts(),
  );
}

export function usedModelIdSet() {
  return new Set(aggregateForRange().usedModelIds);
}

export function formatRateCell(rate) {
  if (rate === undefined) return '<span class="muted">—</span>';
  return escapeHtml(formatRateUsd(rate));
}

export function poolLabel(pool) {
  return pool === "firstParty" ? t("pricingPoolFirstParty") : t("pricingPoolApi");
}

export function deltaClass(deltaPercent) {
  if (deltaPercent === null || !Number.isFinite(deltaPercent)) return "";
  if (Math.abs(deltaPercent) <= 10) return "pricing-delta-ok";
  return "pricing-delta-warn";
}

export function formatDeltaPercent(deltaPercent) {
  if (deltaPercent === null || !Number.isFinite(deltaPercent)) return "—";
  const sign = deltaPercent > 0 ? "+" : "";
  return sign + deltaPercent.toFixed(1) + "%";
}
