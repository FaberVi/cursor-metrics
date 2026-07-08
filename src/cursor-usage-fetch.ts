import { cursorHeaders, getCursorToken } from "./cursor-auth";
import { apiLog } from "./cursor-api-logger";
import type {
  AuthInfo,
  CursorHeaders,
  DailySpendRow,
  RequestTotals,
  SetupCache,
  UsageEvent,
  UsagePayload,
} from "./cursor-api-types";
import { asRecord, MAX_STORE_SYNC_PAGES, MAX_USAGE_EVENT_PAGES, nextMonth, toNumber, withTimeout } from "./cursor-api-utils";
import { billingCycleEndIso, fetchCurrentPeriodUsage } from "./cursor-period-usage";
import { ensureSetup, withPlanInfo } from "./cursor-setup";
import {
  extractTeamRequestLimit,
  extractTeamUsedRequests,
  extractUsageFromSummary,
  extractUsageTotals,
  mergeTeamIncludedRequests,
  parseUsageEvent,
} from "./cursor-usage-parsing";
import {
  buildOnDemandFromSpendLimit,
  buildTeamOnDemandFallback,
  finalizeOnDemandUsage,
  mergeOnDemandUsage,
  resolveOnDemandEnabled,
  resolveOnDemandFromUsageSummary,
  type OnDemandUsage,
} from "./on-demand";

async function fetchUsageSummary(headers: CursorHeaders): Promise<Record<string, unknown> | null> {
  const res = await fetch("https://cursor.com/api/usage-summary", withTimeout({ headers }));
  if (!res.ok) {
    apiLog(`usage-summary failed: ${res.status}`);
    return null;
  }
  return asRecord(await res.json());
}

function buildSoloOnDemand(
  setup: SetupCache,
  periodUsage: Record<string, unknown> | null,
  usageSummary: Record<string, unknown> | null,
  mySpendCents = 0,
): OnDemandUsage {
  const usageSummaryEnabled = resolveOnDemandFromUsageSummary(usageSummary, false);
  const onDemandEnabled = resolveOnDemandEnabled(
    setup.stripeRecord,
    periodUsage,
    null,
    usageSummaryEnabled,
  );
  return finalizeOnDemandUsage(
    buildOnDemandFromSpendLimit(periodUsage?.spendLimitUsage, onDemandEnabled, mySpendCents),
    onDemandEnabled,
  );
}

function buildTeamOnDemand(
  setup: SetupCache,
  periodUsage: Record<string, unknown> | null,
  usageSummary: Record<string, unknown> | null,
  members: unknown[],
  meRecord: Record<string, unknown>,
  dataRecord: Record<string, unknown>,
): OnDemandUsage {
  const spendCents = toNumber(meRecord.spendCents) ?? 0;
  const usageSummaryEnabled = resolveOnDemandFromUsageSummary(usageSummary, true);
  const onDemandEnabled = resolveOnDemandEnabled(
    setup.stripeRecord,
    periodUsage,
    dataRecord,
    usageSummaryEnabled,
  );
  const onDemandFromPeriod = buildOnDemandFromSpendLimit(
    periodUsage?.spendLimitUsage,
    onDemandEnabled,
    spendCents,
  );
  const onDemandFallback = buildTeamOnDemandFallback(members, meRecord, dataRecord, onDemandEnabled);
  const onDemand = finalizeOnDemandUsage(
    mergeOnDemandUsage(onDemandFromPeriod, onDemandFallback, onDemandEnabled),
    onDemandEnabled,
  );
  const spendLimitLog = asRecord(periodUsage?.spendLimitUsage);
  apiLog(
    `On-demand state: ${onDemand.state}, enabled=${onDemandEnabled}, summary.onDemand=${usageSummaryEnabled ?? "n/a"}, period.enabled=${periodUsage?.enabled ?? "n/a"}${onDemand.breakdown?.isTeamPool ? " (team pool)" : ""}${spendLimitLog ? `, spendLimit={pooledLimit:${spendLimitLog.pooledLimit ?? "n/a"}, pooledUsed:${spendLimitLog.pooledUsed ?? "n/a"}, pooledRemaining:${spendLimitLog.pooledRemaining ?? "n/a"}}` : ""}`,
  );
  return onDemand;
}

async function enrichPayloadOnDemand(
  auth: AuthInfo,
  setup: SetupCache,
  payload: UsagePayload,
  usageSummary: Record<string, unknown> | null,
): Promise<UsagePayload> {
  const periodUsage = await fetchCurrentPeriodUsage(auth.accessToken);

  if (setup.isTeamMember && setup.teamId) {
    const teamSpendRes = await fetch("https://cursor.com/api/dashboard/get-team-spend", withTimeout({
      method: "POST",
      headers: cursorHeaders(auth.sessionToken),
      body: JSON.stringify({ teamId: setup.teamId }),
    }));
    if (!teamSpendRes.ok) {
      apiLog(`get-team-spend enrichment skipped: ${teamSpendRes.status}`);
      return payload;
    }

    const dataRecord = asRecord(await teamSpendRes.json()) ?? {};
    const members: unknown[] = Array.isArray(dataRecord.teamMemberSpend) ? dataRecord.teamMemberSpend : [];
    const me = members.find((member) => {
      const record = asRecord(member);
      return record && (record.email === auth.email || String(record.userId) === auth.userId);
    });
    if (!me) return payload;

    const meRecord = asRecord(me) ?? {};
    return {
      ...payload,
      onDemand: buildTeamOnDemand(setup, periodUsage, usageSummary, members, meRecord, dataRecord),
      resetsAt: billingCycleEndIso(periodUsage) ?? payload.resetsAt,
    };
  }

  return {
    ...payload,
    onDemand: buildSoloOnDemand(setup, periodUsage, usageSummary),
    resetsAt: billingCycleEndIso(periodUsage) ?? payload.resetsAt,
  };
}

async function fetchTeamUsage(
  auth: AuthInfo,
  headers: CursorHeaders,
  setup: SetupCache,
): Promise<UsagePayload | null> {
  const [teamSpendRes, usageRes, usageSummary, periodUsage] = await Promise.all([
    fetch("https://cursor.com/api/dashboard/get-team-spend", withTimeout({
      method: "POST",
      headers,
      body: JSON.stringify({ teamId: setup.teamId }),
    })),
    fetch(`https://cursor.com/api/usage?user=${auth.userId}`, withTimeout({ headers })),
    fetchUsageSummary(headers),
    fetchCurrentPeriodUsage(auth.accessToken),
  ]);

  if (!teamSpendRes.ok) {
    apiLog(`get-team-spend failed: ${teamSpendRes.status}`);
    return null;
  }

  let usageTotals: RequestTotals | null = null;
  if (usageRes.ok) {
    const usage = await usageRes.json();
    usageTotals = extractUsageTotals(usage);
  } else {
    apiLog(`Usage API failed in team mode: ${usageRes.status}`);
  }

  const data = await teamSpendRes.json();
  const dataRecord = asRecord(data) ?? {};
  const members: unknown[] = Array.isArray(dataRecord.teamMemberSpend) ? dataRecord.teamMemberSpend : [];
  const me = members.find((member) => {
    const record = asRecord(member);
    return record && (record.email === auth.email || String(record.userId) === auth.userId);
  });

  if (!me) {
    apiLog(`Could not find current user in team spend (email=${auth.email}, userId=${auth.userId})`);
    return null;
  }

  const nextCycleStart = toNumber(dataRecord.nextCycleStart);
  const resetsAt = nextCycleStart !== null
    ? new Date(nextCycleStart).toISOString()
    : null;

  const meRecord = asRecord(me) ?? {};
  apiLog(`Team member keys: ${Object.keys(meRecord).join(", ") || "(none)"}`);

  const memberUsed = extractTeamUsedRequests(meRecord);
  const memberLimit = extractTeamRequestLimit(meRecord, setup.maxRequestUsage);

  const merged = mergeTeamIncludedRequests(usageTotals, memberUsed, memberLimit);
  const { used, limit, usedSource, limitSource } = merged;
  apiLog(`Team request source: used=${usedSource}, limit=${limitSource}`);

  const onDemand = buildTeamOnDemand(setup, periodUsage, usageSummary, members, meRecord, dataRecord);

  const result: UsagePayload = {
    includedRequests: {
      used,
      limit,
    },
    onDemand,
    poolUsage: null,
    resetsAt: billingCycleEndIso(periodUsage) ?? resetsAt,
    planInfo: null,
  };

  const spendLimitLabel = result.onDemand.state === "unlimited"
    ? "∞"
    : result.onDemand.state === "disabled"
      ? "hidden"
      : `$${(result.onDemand.limitDollars ?? 0).toFixed(2)}`;
  apiLog(
    `Result: ${result.includedRequests.used}/${result.includedRequests.limit} reqs, $${result.onDemand.spendDollars.toFixed(2)}/${spendLimitLabel}`,
  );
  return result;
}

async function fetchSoloUsage(
  auth: AuthInfo,
  headers: CursorHeaders,
  setup: SetupCache,
): Promise<UsagePayload | null> {
  const [usageRes, periodUsage, usageSummary] = await Promise.all([
    fetch(`https://cursor.com/api/usage?user=${auth.userId}`, withTimeout({ headers })),
    fetchCurrentPeriodUsage(auth.accessToken),
    fetchUsageSummary(headers),
  ]);

  if (!usageRes.ok) {
    apiLog(`Usage API failed: ${usageRes.status}`);
    return null;
  }

  const usage = await usageRes.json();
  const totals = extractUsageTotals(usage);
  const resetsAt = usage.startOfMonth ? nextMonth(usage.startOfMonth) : null;
  const onDemand = buildSoloOnDemand(setup, periodUsage, usageSummary);

  const result: UsagePayload = {
    includedRequests: {
      used: totals.used,
      limit: totals.limit,
    },
    onDemand,
    poolUsage: null,
    resetsAt: billingCycleEndIso(periodUsage) ?? resetsAt,
    planInfo: null,
  };

  apiLog(`Result: ${result.includedRequests.used}/${result.includedRequests.limit} reqs`);
  return result;
}

export async function fetchUsageData(): Promise<UsagePayload | null> {
  apiLog("--- Fetching usage data ---");

  const auth = await getCursorToken();
  if (!auth) {
    apiLog("Failed to get auth token");
    return null;
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, auth.sessionToken, headers, auth.email);
  if (!setup) {
    apiLog("Setup failed");
    return null;
  }

  const summary = await fetchUsageSummary(headers);
  if (summary) {
    const fromSummary = extractUsageFromSummary(summary, setup.onDemandEnabled);
    if (fromSummary && (fromSummary.includedRequests.limit > 0 || fromSummary.includedRequests.used > 0)) {
      apiLog(
        `Using usage-summary: ${fromSummary.includedRequests.used}/${fromSummary.includedRequests.limit} reqs`,
      );
      return withPlanInfo(await enrichPayloadOnDemand(auth, setup, fromSummary, summary), setup);
    }
    apiLog("usage-summary returned no usable plan limits; falling back to legacy endpoints");
  }

  if (setup.isTeamMember) {
    const payload = await fetchTeamUsage(auth, headers, setup);
    return payload ? withPlanInfo(payload, setup) : null;
  }
  const payload = await fetchSoloUsage(auth, headers, setup);
  return payload ? withPlanInfo(payload, setup) : null;
}

function parseDailySpendRow(row: unknown): DailySpendRow | null {
  const data = asRecord(row);
  if (!data) return null;

  const day = toNumber(data.day);
  const category = typeof data.category === "string" ? data.category : null;
  const spendCents = toNumber(data.spendCents);
  const totalTokens = toNumber(data.totalTokens);

  if (day === null || !category || spendCents === null || totalTokens === null) {
    return null;
  }

  return {
    day,
    category,
    spendCents,
    totalTokens,
  };
}

async function resolveDashboardUserId(
  auth: AuthInfo,
  headers: CursorHeaders,
  setup: SetupCache,
): Promise<number | null> {
  const directUserId = toNumber(auth.userId);
  if (directUserId !== null) {
    return directUserId;
  }

  if (!setup.isTeamMember || !setup.teamId) {
    return null;
  }

  const res = await fetch("https://cursor.com/api/dashboard/get-team-spend", withTimeout({
    method: "POST",
    headers,
    body: JSON.stringify({ teamId: setup.teamId }),
  }));
  if (!res.ok) {
    apiLog(`get-team-spend failed while resolving dashboard user id: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const members: unknown[] = Array.isArray(data.teamMemberSpend) ? data.teamMemberSpend : [];
  for (const member of members) {
    const record = asRecord(member);
    if (!record) continue;

    const memberEmail = typeof record.email === "string" ? record.email : null;
    const memberAuthId = typeof record.authId === "string" ? record.authId : null;
    const memberUserId = toNumber(record.userId);
    if (memberUserId === null) continue;

    if (
      (auth.email && memberEmail === auth.email) ||
      (memberAuthId && memberAuthId === auth.userId) ||
      String(record.userId) === auth.userId
    ) {
      return memberUserId;
    }
  }

  apiLog(`Could not resolve dashboard user id from team spend (email=${auth.email}, userId=${auth.userId})`);
  return null;
}

export async function fetchDailySpendByCategory(): Promise<DailySpendRow[]> {
  apiLog("--- Fetching daily spend by category ---");

  const auth = await getCursorToken();
  if (!auth) {
    apiLog("Failed to get auth token for daily spend");
    return [];
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, auth.sessionToken, headers, auth.email);
  if (!setup?.isTeamMember || !setup.teamId) {
    apiLog("Skipping daily spend fetch: team setup unavailable");
    return [];
  }

  const dashboardUserId = await resolveDashboardUserId(auth, headers, setup);
  if (dashboardUserId === null) {
    apiLog("Skipping daily spend fetch: dashboard user id unavailable");
    return [];
  }

  const periodEndMs = Date.now();
  const periodStartMs = periodEndMs - 31 * 86_400_000;
  const res = await fetch("https://cursor.com/api/dashboard/get-daily-spend-by-category", withTimeout({
    method: "POST",
    headers,
    body: JSON.stringify({
      teamId: setup.teamId,
      userId: dashboardUserId,
      periodStartMs,
      periodEndMs,
      groupBy: 1,
      spendType: 1,
    }),
  }));

  if (!res.ok) {
    apiLog(`get-daily-spend-by-category failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const rows: unknown[] = Array.isArray(data.dailySpend) ? data.dailySpend : [];
  const parsedRows: DailySpendRow[] = [];
  for (const row of rows) {
    const parsed = parseDailySpendRow(row);
    if (parsed) parsedRows.push(parsed);
  }
  apiLog(`Fetched ${parsedRows.length} daily spend rows`);
  return parsedRows;
}

export type FetchUsageEventsOptions = {
  maxPages?: number;
  lookbackDays?: number;
};

export async function fetchUsageEvents(opts: FetchUsageEventsOptions = {}): Promise<UsageEvent[]> {
  apiLog("--- Fetching usage events ---");

  const auth = await getCursorToken();
  if (!auth) {
    apiLog("Failed to get auth token for events");
    return [];
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, auth.sessionToken, headers, auth.email);
  const teamId = setup?.teamId ?? 0;

  const endDate = Date.now();
  const lookbackDays = opts.lookbackDays ?? 31;
  const maxPages = opts.maxPages ?? MAX_USAGE_EVENT_PAGES;
  const startDate = endDate - lookbackDays * 86_400_000;
  const pageSize = 500;
  let page = 1;
  const allEvents: UsageEvent[] = [];

  while (page <= maxPages) {
    const res = await fetch("https://cursor.com/api/dashboard/get-filtered-usage-events", withTimeout({
      method: "POST",
      headers,
      body: JSON.stringify({
        teamId,
        startDate: String(startDate),
        endDate: String(endDate),
        page,
        pageSize,
      }),
    }));

    if (!res.ok) {
      apiLog(`get-filtered-usage-events failed: ${res.status}`);
      break;
    }

    const data = await res.json();
    const dataRecord = asRecord(data) ?? {};
    const events: unknown[] = Array.isArray(dataRecord.usageEventsDisplay) ? dataRecord.usageEventsDisplay : [];

    if (page === 1) {
      apiLog(`Total usage events available: ${dataRecord.totalUsageEventsCount ?? "unknown"}`);
    }

    for (const event of events) {
      const parsed = parseUsageEvent(event);
      if (parsed) allEvents.push(parsed);
    }

    if (events.length < pageSize) break;
    page++;
  }

  if (page > maxPages) {
    apiLog(`Stopped usage events fetch after ${maxPages} page(s)`);
  }

  apiLog(`Fetched ${allEvents.length} usage events across ${Math.min(page, maxPages)} page(s)`);
  return allEvents;
}
