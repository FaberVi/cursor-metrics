import { apiLog } from "./cursor-api-logger";
import type {
  NumberWithSource,
  RequestTotals,
  UsageEvent,
  UsagePayload,
} from "./cursor-api-types";
import { asRecord, getBillingCycleCutoff, nextMonth, parseTimestamp, toNumber } from "./cursor-api-utils";
import { getCachedMaxRequestUsage } from "./cursor-setup-cache";
import type { OnDemandUsage } from "./on-demand-types";

function extractBucketTotals(bucket: Record<string, unknown>, source: string): RequestTotals | null {
  const used =
    toNumber(bucket.numRequests) ??
    toNumber(bucket.usedRequests) ??
    toNumber(bucket.requestsUsed) ??
    toNumber(bucket.includedRequestsUsed) ??
    toNumber(bucket.premiumRequestsUsed) ??
    toNumber(bucket.fastPremiumRequestsUsed);

  const limit =
    toNumber(bucket.maxRequestUsage) ??
    toNumber(bucket.maxRequests) ??
    toNumber(bucket.requestLimit) ??
    toNumber(bucket.includedRequestLimit) ??
    toNumber(bucket.premiumRequestLimit);

  if (used === null && limit === null) return null;
  return { used: used ?? 0, limit: limit ?? 0, source };
}

function pickBestTotals(candidates: RequestTotals[]): RequestTotals | null {
  if (candidates.length === 0) return null;
  const [best] = [...candidates].sort((a, b) => {
    const aScore = Number(a.limit > 0) + Number(a.used > 0);
    const bScore = Number(b.limit > 0) + Number(b.used > 0);
    if (aScore !== bScore) return bScore - aScore;
    if (a.limit !== b.limit) return b.limit - a.limit;
    return b.used - a.used;
  });
  return best ?? null;
}

export function extractUsageTotals(usageRaw: unknown): RequestTotals {
  const usage = asRecord(usageRaw);
  if (!usage) {
    apiLog("Usage payload is not an object; defaulting totals to 0/0");
    return { used: 0, limit: 0, source: "none" };
  }

  const keys = Object.keys(usage);
  apiLog(`Usage keys: ${keys.length > 0 ? keys.join(", ") : "(none)"}`);

  const gpt4 = asRecord(usage["gpt-4"]);
  const gpt4Totals = gpt4 ? extractBucketTotals(gpt4, "gpt-4") : null;

  const dynamicCandidates: RequestTotals[] = [];
  const rootTotals = extractBucketTotals(usage, "root");
  if (rootTotals) dynamicCandidates.push(rootTotals);

  for (const [key, value] of Object.entries(usage)) {
    if (key === "gpt-4") continue;
    const bucket = asRecord(value);
    if (!bucket) continue;
    const totals = extractBucketTotals(bucket, key);
    if (totals) dynamicCandidates.push(totals);
  }

  const bestDynamic = pickBestTotals(dynamicCandidates);
  if (!gpt4Totals && !bestDynamic) {
    apiLog("Could not parse usage totals from payload; defaulting to 0/0");
    return { used: 0, limit: 0, source: "none" };
  }

  if (gpt4Totals && !bestDynamic) {
    apiLog(`Using usage bucket: ${gpt4Totals.source} (${gpt4Totals.used}/${gpt4Totals.limit})`);
    if (gpt4Totals.used === 0 && gpt4Totals.limit === 0) {
      return { used: 0, limit: 0, source: "none" };
    }
    return gpt4Totals;
  }

  if (!gpt4Totals && bestDynamic) {
    apiLog(`Using usage bucket: ${bestDynamic.source} (${bestDynamic.used}/${bestDynamic.limit})`);
    if (bestDynamic.used === 0 && bestDynamic.limit === 0) {
      return { used: 0, limit: 0, source: "none" };
    }
    return bestDynamic;
  }

  if (gpt4Totals && bestDynamic) {
    const chooseDynamic =
      bestDynamic.limit > gpt4Totals.limit ||
      (bestDynamic.limit === gpt4Totals.limit && bestDynamic.used > gpt4Totals.used);

    const selected = chooseDynamic ? bestDynamic : gpt4Totals;
    apiLog(`Using usage bucket: ${selected.source} (${selected.used}/${selected.limit})`);
    if (selected.used === 0 && selected.limit === 0) {
      return { used: 0, limit: 0, source: "none" };
    }
    return selected;
  }

  const chosen = gpt4Totals ?? bestDynamic;
  if (chosen && chosen.used === 0 && chosen.limit === 0) {
    apiLog("Legacy usage buckets are all zero; treating as unparsed");
    return { used: 0, limit: 0, source: "none" };
  }

  return { used: 0, limit: 0, source: "none" };
}

function pickNumber(record: Record<string, unknown>, fields: string[]): NumberWithSource | null {
  for (const field of fields) {
    const value = toNumber(record[field]);
    if (value !== null) {
      return { value, source: field };
    }
  }
  return null;
}

function extractOnDemandFromSummaryBlock(
  block: Record<string, unknown> | null,
  stripeOnDemandEnabled: boolean,
): OnDemandUsage {
  if (!block || block.enabled !== true) {
    return stripeOnDemandEnabled
      ? { state: "unlimited", onDemandEnabled: true, spendDollars: 0, limitDollars: null }
      : { state: "disabled", onDemandEnabled: false, spendDollars: 0, limitDollars: null };
  }

  const usedCents = toNumber(block.used) ?? 0;
  const spendDollars = usedCents / 100;
  const limitCents = toNumber(block.limit);

  if (limitCents !== null && limitCents > 0) {
    return {
      state: "limited",
      onDemandEnabled: stripeOnDemandEnabled,
      spendDollars,
      limitDollars: limitCents / 100,
    };
  }

  return { state: "unlimited", onDemandEnabled: true, spendDollars, limitDollars: null };
}

function extractPoolUsageFromPlan(plan: Record<string, unknown>): UsagePayload["poolUsage"] {
  const autoPercentUsed = toNumber(plan.autoPercentUsed);
  const apiPercentUsed = toNumber(plan.apiPercentUsed);
  const totalPercentUsed = toNumber(plan.totalPercentUsed);
  if (autoPercentUsed === null && apiPercentUsed === null && totalPercentUsed === null) {
    return null;
  }
  return {
    autoPercentUsed: autoPercentUsed ?? 0,
    apiPercentUsed: apiPercentUsed ?? 0,
    totalPercentUsed: totalPercentUsed ?? 0,
  };
}

export function extractUsageFromSummary(
  summaryRaw: unknown,
  stripeOnDemandEnabled: boolean,
): UsagePayload | null {
  const summary = asRecord(summaryRaw);
  if (!summary) {
    apiLog("usage-summary payload is not an object");
    return null;
  }

  const individual = asRecord(summary.individualUsage);
  const plan = individual ? asRecord(individual.plan) : null;
  if (!plan || plan.enabled === false) {
    apiLog("usage-summary: plan disabled or missing");
    return null;
  }

  const used = toNumber(plan.used);
  const limit = toNumber(plan.limit);
  const breakdown = asRecord(plan.breakdown);
  const breakdownUsed =
    toNumber(breakdown?.included) ??
    toNumber(breakdown?.total);
  const breakdownLimit =
    toNumber(breakdown?.total) ??
    toNumber(breakdown?.included);

  const resolvedUsed = used ?? breakdownUsed ?? 0;
  const resolvedLimit = limit ?? breakdownLimit ?? 0;

  if (resolvedUsed === 0 && resolvedLimit === 0) {
    apiLog("usage-summary: no plan used/limit fields");
    return null;
  }

  const individualOnDemand = individual ? asRecord(individual.onDemand) : null;
  const teamUsage = asRecord(summary.teamUsage);
  const teamOnDemand = teamUsage ? asRecord(teamUsage.onDemand) : null;
  const onDemandBlock =
    individualOnDemand?.enabled === true ? individualOnDemand : teamOnDemand;
  const onDemand = extractOnDemandFromSummaryBlock(onDemandBlock, stripeOnDemandEnabled);

  const billingCycleEnd = typeof summary.billingCycleEnd === "string" ? summary.billingCycleEnd : null;
  const billingCycleStart = typeof summary.billingCycleStart === "string" ? summary.billingCycleStart : null;
  const resetsAt = billingCycleEnd ?? (billingCycleStart ? nextMonth(billingCycleStart) : null);

  return {
    includedRequests: {
      used: resolvedUsed,
      limit: resolvedLimit,
    },
    onDemand,
    poolUsage: extractPoolUsageFromPlan(plan),
    resetsAt,
    planInfo: null,
  };
}

export function mergeTeamIncludedRequests(
  usageTotals: RequestTotals | null,
  memberUsed: NumberWithSource,
  memberLimit: NumberWithSource,
): { used: number; limit: number; usedSource: string; limitSource: string } {
  const hasParsedUsage = usageTotals !== null && usageTotals.source !== "none";
  const used = hasParsedUsage ? usageTotals.used : memberUsed.value;
  const limit =
    usageTotals !== null && usageTotals.limit > 0
      ? usageTotals.limit
      : memberLimit.value > 0
        ? memberLimit.value
        : hasParsedUsage
          ? usageTotals.limit
          : memberLimit.value;

  const usedSource = hasParsedUsage
    ? `usage.${usageTotals.source}.used`
    : `member.${memberUsed.source}`;
  const limitSource =
    usageTotals !== null && usageTotals.limit > 0
      ? `usage.${usageTotals.source}.limit`
      : memberLimit.value > 0
        ? `member.${memberLimit.source}`
        : hasParsedUsage
          ? `usage.${usageTotals.source}.limit`
          : `member.${memberLimit.source}`;

  return { used, limit, usedSource, limitSource };
}

export function extractTeamUsedRequests(member: Record<string, unknown>): NumberWithSource {
  return (
    pickNumber(member, [
      "includedRequestsUsed",
      "numRequests",
      "requestsUsed",
      "fastPremiumRequests",
      "fastPremiumRequestsUsed",
      "premiumRequestsUsed",
      "requestCount",
      "includedUsage",
    ]) ?? { value: 0, source: "fallback:0" }
  );
}

export function extractTeamRequestLimit(
  member: Record<string, unknown>,
  fallbackLimit: number,
): NumberWithSource {
  return (
    pickNumber(member, [
      "includedRequestLimit",
      "maxRequestUsage",
      "maxRequests",
      "requestLimit",
      "premiumRequestLimit",
    ]) ?? {
      value: fallbackLimit,
      source: "setup.maxRequestUsage",
    }
  );
}

export function enrichUsageFromEvents(
  data: UsagePayload,
  events: UsageEvent[],
  now = Date.now(),
): UsagePayload {
  if (data.includedRequests.limit > 0 && data.includedRequests.used > 0) {
    return data;
  }

  const cutoff = getBillingCycleCutoff(data.resetsAt, now);
  let includedUsed = 0;
  let onDemandSpendCents = 0;

  for (const event of events) {
    if (event.timestamp < cutoff) continue;
    if (event.kind === "Included") {
      includedUsed += eventRequestCount(event);
    } else if (event.kind === "On-Demand") {
      onDemandSpendCents += event.spendCents;
    }
  }

  const cachedLimit = getCachedMaxRequestUsage();
  const used = data.includedRequests.used > 0 ? data.includedRequests.used : Math.round(includedUsed);
  const limit =
    data.includedRequests.limit > 0
      ? data.includedRequests.limit
      : cachedLimit > 0
        ? cachedLimit
        : used > 0
          ? used
          : 0;

  if (used === data.includedRequests.used && limit === data.includedRequests.limit) {
    return data;
  }

  apiLog(`Enriched usage from events: ${used}/${limit} (events included reqs=${includedUsed.toFixed(1)})`);

  const onDemand =
    data.onDemand.state === "disabled" && onDemandSpendCents > 0
      ? { state: "unlimited" as const, onDemandEnabled: true, spendDollars: onDemandSpendCents / 100, limitDollars: null }
      : data.onDemand;

  return {
    ...data,
    includedRequests: { used, limit },
    onDemand,
  };
}

function parseEventKind(kind: string): string {
  if (kind === "USAGE_EVENT_KIND_USAGE_BASED") return "On-Demand";
  if (kind === "USAGE_EVENT_KIND_ERRORED_NOT_CHARGED") return "Errored";
  if (kind === "USAGE_EVENT_KIND_ABORTED_NOT_CHARGED") return "Aborted";
  return "Included";
}

/** Whether this row is billed by tokens (vs legacy request-metered plans). */
export function isTokenMeteredUsageEvent(
  event: Pick<
    UsageEvent,
    | "isTokenBasedCall"
    | "inputTokens"
    | "outputTokens"
    | "cacheWriteTokens"
    | "cacheReadTokens"
    | "totalTokens"
    | "requests"
  >,
): boolean {
  if (event.isTokenBasedCall) return true;

  const breakdown =
    (event.inputTokens ?? 0) +
    (event.outputTokens ?? 0) +
    (event.cacheWriteTokens ?? 0) +
    (event.cacheReadTokens ?? 0);
  if (breakdown > 0) return true;

  const totalTokens = event.totalTokens ?? 0;
  const stored = event.requests ?? 0;
  // Archived rows sometimes stored token totals in `requests`.
  if (totalTokens > 1000 && stored >= totalTokens * 0.5) return true;

  return false;
}

/** Request count for charts/tables — not the same as API `requestsCosts` on token-metered events. */
export function eventRequestCount(
  event: Pick<
    UsageEvent,
    | "requests"
    | "isTokenBasedCall"
    | "kind"
    | "inputTokens"
    | "outputTokens"
    | "cacheWriteTokens"
    | "cacheReadTokens"
    | "totalTokens"
  >,
): number {
  if (isTokenMeteredUsageEvent(event)) {
    return 1;
  }

  const stored = event.requests ?? 0;
  if (!Number.isFinite(stored) || stored <= 0) return 1;
  if (stored > 1000) return 1;
  return stored;
}

/** Normalize stored requests on events loaded from archive/API. */
export function normalizeUsageEventRequests(event: UsageEvent): UsageEvent {
  const requests = eventRequestCount(event);
  if (requests === event.requests) return event;
  return { ...event, requests };
}

export function parseEventRequests(
  raw: Record<string, unknown>,
  kind: string,
  isTokenBasedCall: boolean,
): number {
  const numRequests = toNumber(raw.numRequests);
  if (numRequests !== null) return numRequests;
  const requestsCosts = toNumber(raw.requestsCosts);
  if (isTokenBasedCall && parseEventKind(kind) === "Included") {
    return 1;
  }
  return requestsCosts ?? 1;
}

export function parseUsageEvent(raw: unknown): UsageEvent | null {
  const e = asRecord(raw);
  if (!e) return null;

  const tok = asRecord(e.tokenUsage) ?? {};
  const inputTokens = toNumber(tok.inputTokens) ?? 0;
  const outputTokens = toNumber(tok.outputTokens) ?? 0;
  const cacheWriteTokens = toNumber(tok.cacheWriteTokens) ?? 0;
  const cacheReadTokens = toNumber(tok.cacheReadTokens) ?? 0;
  const totalTokens = inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens;
  const kind = parseEventKind(typeof e.kind === "string" ? e.kind : "");
  const isTokenBasedCall = Boolean(e.isTokenBasedCall);

  const event: UsageEvent = {
    timestamp: parseTimestamp(e.timestamp),
    model: typeof e.model === "string" ? e.model : "unknown",
    kind,
    totalTokens,
    requests: parseEventRequests(e, typeof e.kind === "string" ? e.kind : "", isTokenBasedCall),
    spendCents: toNumber(e.chargedCents) ?? 0,
    maxMode: Boolean(e.maxMode),
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    tokenCostCents: toNumber(tok.totalCents) ?? 0,
    cursorTokenFee: toNumber(e.cursorTokenFee) ?? 0,
    isTokenBasedCall,
    isHeadless: Boolean(e.isHeadless),
    isChargeable: e.isChargeable !== false,
    conversationId:
      typeof e.conversationId === "string"
      && e.conversationId.trim() !== ""
      && e.conversationId !== "null"
        ? e.conversationId.trim()
        : null,
  };

  return normalizeUsageEventRequests(event);
}

export { parseTimestamp } from "./cursor-api-utils";
