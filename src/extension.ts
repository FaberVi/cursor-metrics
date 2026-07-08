import * as vscode from "vscode";
import {
  configure,
  enrichUsageFromEvents,
  fetchDailySpendByCategory,
  fetchUsageData,
  fetchUsageEvents,
  isTeamMemberCached,
  type DailySpendRow,
  type UsagePayload,
  type UsageEvent,
} from "./cursor-api";
import { DashboardPanel, OPEN_DASHBOARD_COMMAND } from "./dashboard-panel";
import { buildConversationTitleMap } from "./conversation-titles";
import { loadConversationMessages } from "./conversation-messages";
import { CONVERSATION_PREVIEW_KEY } from "./dashboard-locale";
import { getDashboardLocale } from "./dashboard-locale-state";
import { getDashboardCurrency } from "./dashboard-currency-state";
import type { DashboardCurrency, DashboardLocale } from "./dashboard-locale";
import { formatOnDemandStatus } from "./currency-format";
import { isOnDemandVisible } from "./on-demand";
import { buildDashboardState, filterDashboardEvents, type DashboardState } from "./dashboard-state";
import { MAX_STORE_SYNC_PAGES } from "./cursor-api-utils";
import {
  resolveConfiguredUsageDuration,
} from "./duration-options";
import { formatTokens } from "./format";
import { formatResetCountdown, t } from "./i18n";
import {
  aggregateByModel,
  filterZeroTokenModels,
  formatDollarsFromCents,
  type ModelBreakdownSortBy,
  type SortOrder,
  type UsageDuration,
} from "./model-breakdown";
import { formatModelLabel } from "./model-labels";
import { formatStatusBarUsageText } from "./pool-usage";
import {
  buildUsageByModelHeadingMarkdown,
  buildUsageOverviewMarkdown,
  OPEN_DURATION_SETTING_COMMAND,
} from "./tooltip";
import { isIncludedQuotaExhausted, shouldShowPremiumRequestsQuota } from "./usage-display";
import { UsageEventStore } from "./usage-event-store";

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastData: UsagePayload | null = null;
let lastError: string | null = null;
let lastFetchTime = 0;
let isFetching = false;
let lastEvents: UsageEvent[] | null = null;
let lastDailySpend: DailySpendRow[] | null = null;
let extensionContext: vscode.ExtensionContext;
let eventStore: UsageEventStore | null = null;
let conversationTitles: Record<string, string> = {};
let conversationPreviewEnabled = false;
let storedEventCount = 0;

const STORE_LOOKBACK_DAYS = 120;
const DEBOUNCE_MS = 30_000;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("cursorUsage");
  const modelBreakdownSortBy = cfg.get<ModelBreakdownSortBy>("modelBreakdownSortBy", "tokens");
  const modelBreakdownSortOrder = cfg.get<SortOrder>("modelBreakdownSortOrder", "desc");
  return {
    pollInterval: cfg.get<number>("pollInterval", 5),
    minimalMode: cfg.get<boolean>("minimalMode", false),
    usageDuration: cfg.get<string>("usageDuration", "billingCycle"),
    modelBreakdownSortBy,
    modelBreakdownSortOrder,
    excludeZeroTokenModels: cfg.get<boolean>("excludeZeroTokenModels", false),
    quotaAwareEventDisplay: cfg.get<boolean>("quotaAwareEventDisplay", true),
  };
}

function getCooldownMs(): number {
  return getConfig().pollInterval * 60_000;
}

function scheduleRefresh() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    if (Date.now() - lastFetchTime >= getCooldownMs()) {
      updateUsage();
    }
  }, DEBOUNCE_MS);
}

function refreshOnFocus(state: vscode.WindowState) {
  if (state.focused && Date.now() - lastFetchTime >= getCooldownMs()) {
    updateUsage();
  }
}

function getLocale(): DashboardLocale {
  return getDashboardLocale(extensionContext);
}

function getCurrency(): DashboardCurrency {
  return getDashboardCurrency(extensionContext);
}

function isConversationPreviewEnabled(): boolean {
  return extensionContext.globalState.get<boolean>(CONVERSATION_PREVIEW_KEY) === true;
}

async function ensureEventStore(): Promise<UsageEventStore> {
  if (!eventStore) {
    eventStore = new UsageEventStore(
      extensionContext.globalStorageUri.fsPath,
      extensionContext.extensionPath,
    );
    await eventStore.init();
  }
  return eventStore;
}

async function refreshConversationTitles(events: UsageEvent[]): Promise<number> {
  conversationPreviewEnabled = isConversationPreviewEnabled();
  if (!conversationPreviewEnabled) {
    conversationTitles = {};
    return 0;
  }
  const ids = events.map((event) => event.conversationId).filter((id): id is string => Boolean(id));
  conversationTitles = await buildConversationTitleMap(ids, extensionContext.extensionPath);
  return Object.keys(conversationTitles).length;
}

async function handleConversationPreviewChange(previewEnabled: boolean): Promise<void> {
  conversationPreviewEnabled = previewEnabled;
  await extensionContext.globalState.update(CONVERSATION_PREVIEW_KEY, previewEnabled);
  const conversationCount = previewEnabled
    ? new Set((lastEvents ?? []).map((e) => e.conversationId).filter(Boolean)).size
    : 0;
  const titleCount = previewEnabled && lastEvents ? await refreshConversationTitles(lastEvents) : 0;
  if (!previewEnabled) {
    conversationTitles = {};
  }
  DashboardPanel.currentPanel?.postPreviewStatus(previewEnabled, titleCount, conversationCount);
  DashboardPanel.currentPanel?.postState(getDashboardState());
}

async function loadStoredEvents(): Promise<UsageEvent[]> {
  const store = await ensureEventStore();
  storedEventCount = store.getEventCount();
  const since = Date.now() - STORE_LOOKBACK_DAYS * 86_400_000;
  return store.getEventsSince(since);
}

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}

function progressBarDataUri(ratio: number, barWidth = 220): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const width = barWidth;
  const height = 10;
  const r = height / 2;
  const fillWidth = Math.round(clamped * width);

  const light = isLightTheme();
  const trackColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
  const fillColor = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.82)";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${trackColor}"/>`;
  if (fillWidth > 0) {
    svg += `<rect width="${fillWidth}" height="${height}" rx="${r}" ry="${r}" fill="${fillColor}"/>`;
  }
  svg += `</svg>`;

  const encoded = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

function progressBarMarkdown(ratio: number, barWidth = 220): string {
  return `![](${progressBarDataUri(ratio, barWidth)})`;
}

function progressBarHtml(ratio: number, barWidth = 220): string {
  return `<img src="${progressBarDataUri(ratio, barWidth)}" width="${barWidth}" height="10" />`;
}

function segmentedProgressBarDataUri(
  segments: Array<{ ratio: number; opacity: number }>,
  barWidth = 220,
): string {
  const width = barWidth;
  const height = 10;
  const r = height / 2;
  const light = isLightTheme();
  const trackColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
  const fillColor = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.82)";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${trackColor}"/>`;

  let offset = 0;
  for (const segment of segments) {
    const segmentWidth = Math.round(Math.min(Math.max(segment.ratio, 0), 1) * width);
    if (segmentWidth <= 0) continue;
    const opacity = Math.min(Math.max(segment.opacity, 0), 1);
    svg += `<rect x="${offset}" width="${segmentWidth}" height="${height}" fill="${fillColor}" opacity="${opacity}"/>`;
    offset += segmentWidth;
  }
  svg += `</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function segmentedProgressBarHtml(
  segments: Array<{ ratio: number; opacity: number }>,
  barWidth = 220,
): string {
  return `<img src="${segmentedProgressBarDataUri(segments, barWidth)}" width="${barWidth}" height="10" />`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

function summaryDividerHtml(height = 52): string {
  const light = isLightTheme();
  const strokeColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="${height}" viewBox="0 0 2 ${height}">`,
    `<rect x="0.5" y="0" width="1" height="${height}" fill="${strokeColor}"/>`,
    `</svg>`,
  ].join("");
  const encoded = Buffer.from(svg).toString("base64");
  return `<img src="data:image/svg+xml;base64,${encoded}" width="2" height="${height}" />`;
}
function buildModelBreakdownTableMarkdown(
  rows: Array<{ model: string; totalTokens: number; requests: number; spendCents: number }>,
  tableWidth: number,
  locale: DashboardLocale,
  currency: DashboardCurrency,
): string {
  if (rows.length === 0) {
    return `*${t(locale, "noUsageInPeriod")}*\n\n`;
  }

  const lines = [
    `<table width="${tableWidth}" cellspacing="0" cellpadding="0">`,
    `  <tr>`,
    `    <th align="left" width="45%">${t(locale, "colModel")}</th>`,
    `    <th align="right" width="15%">${t(locale, "colRequests")}</th>`,
    `    <th align="right" width="20%">${t(locale, "colTokens")}</th>`,
    `    <th align="right" width="20%">${t(locale, "colSpend")}</th>`,
    `  </tr>`,
  ];

  for (const row of rows) {
    lines.push(
      `  <tr>` +
      `<td align="left">${escapeHtml(formatModelLabel(row.model))}</td>` +
      `<td align="right">${Math.round(row.requests)}</td>` +
      `<td align="right">${formatTokens(row.totalTokens)}</td>` +
      `<td align="right">${formatDollarsFromCents(row.spendCents, currency, locale)}</td>` +
      `</tr>`,
    );
  }

  const totalRequests = rows.reduce((sum, row) => sum + row.requests, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.totalTokens, 0);
  const totalSpendCents = rows.reduce((sum, row) => sum + row.spendCents, 0);
  lines.push(
    `  <tr>` +
    `<td align="left"><strong>${t(locale, "total")}</strong></td>` +
    `<td align="right"><strong>${Math.round(totalRequests)}</strong></td>` +
    `<td align="right"><strong>${formatTokens(totalTokens)}</strong></td>` +
    `<td align="right"><strong>${formatDollarsFromCents(totalSpendCents, currency, locale)}</strong></td>` +
    `</tr>`,
  );

  lines.push(`</table>`, ``);
  return lines.join("\n");
}

function formatOnDemandStatusBar(onDemand: UsagePayload["onDemand"]): string {
  return formatOnDemandStatus(onDemand, getCurrency(), getLocale());
}

function getDashboardEvents(now = Date.now()): UsageEvent[] {
  const allEvents = lastEvents ?? [];
  return filterDashboardEvents(
    allEvents,
    DashboardPanel.getDashboardEventFilter(),
    lastData?.resetsAt ?? null,
    now,
  );
}

function updateStatusBar(data: UsagePayload) {
  const { includedRequests, onDemand } = data;
  const { minimalMode } = getConfig();
  const locale = getLocale();
  const currency = getCurrency();
  const showPremiumRequests = shouldShowPremiumRequestsQuota(data.planInfo, data.poolUsage);

  const quotaExhausted = isIncludedQuotaExhausted(data, showPremiumRequests);
  const onDemandVisible = isOnDemandVisible(onDemand);

  if (minimalMode && quotaExhausted && onDemandVisible) {
    statusBarItem.text = `$(pulse) ${formatOnDemandStatusBar(onDemand)}`;
  } else {
    statusBarItem.text = `$(pulse) ${formatStatusBarUsageText(data, {
      onDemandVisible,
      showPremiumRequests,
      currency,
      locale,
    })}`;
  }

  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = {
    enabledCommands: [OPEN_DASHBOARD_COMMAND, "cursor-usage.refresh", OPEN_DURATION_SETTING_COMMAND],
  };
  tooltip.supportThemeIcons = true;
  tooltip.supportHtml = true;

  const barW = 150;
  let md = `### $(pulse) ${t(locale, "title")}\n\n`;
  md += buildUsageOverviewMarkdown(
    { includedRequests, onDemand, poolUsage: data.poolUsage, resetsAt: data.resetsAt },
    {
      markdown: (ratio) => progressBarMarkdown(ratio, barW),
      html: (ratio) => progressBarHtml(ratio, barW),
      segmentedHtml: (segments) => segmentedProgressBarHtml(segments, barW),
      divider: () => summaryDividerHtml(),
    },
    locale,
    Date.now(),
    lastEvents ?? [],
    currency,
    showPremiumRequests,
  );
  md += `\n`;

  if (lastEvents && lastEvents.length > 0) {
    const config = getConfig();
    const usageDuration: UsageDuration = resolveConfiguredUsageDuration(config.usageDuration, Boolean(data.resetsAt));
    const models = aggregateByModel(
      lastEvents,
      lastDailySpend ?? [],
      usageDuration,
      data.resetsAt,
      Date.now(),
      config.modelBreakdownSortBy,
      config.modelBreakdownSortOrder,
    );
    const filteredModels = filterZeroTokenModels(models, config.excludeZeroTokenModels);
    md += `<hr>\n\n`;
    md += buildUsageByModelHeadingMarkdown(usageDuration, locale);
    const modelTableWidth = barW * 2 + 2;
    md += buildModelBreakdownTableMarkdown(filteredModels, modelTableWidth, locale, currency);
  }

  if (data.resetsAt) {
    md += `<hr>\n\n`;
    md += `*${formatResetCountdown(data.resetsAt, locale)}*\n\n`;
  }

  md += `<hr>\n\n`;
  md += `[${t(locale, "openDashboard")}](command:${OPEN_DASHBOARD_COMMAND}) | [${t(locale, "refresh")}](command:cursor-usage.refresh)`;

  tooltip.appendMarkdown(md);
  statusBarItem.tooltip = tooltip;
}

async function updateUsage() {
  if (isFetching) return;
  isFetching = true;

  statusBarItem.text = statusBarItem.text.replace("$(pulse)", "$(loading~spin)");
  await new Promise((r) => setTimeout(r, 0));

  try {
    const [dataResult, eventsResult, spendResult] = await Promise.allSettled([
      fetchUsageData(),
      fetchUsageEvents({ maxPages: MAX_STORE_SYNC_PAGES, lookbackDays: STORE_LOOKBACK_DAYS }),
      fetchDailySpendByCategory(),
    ]);

    if (eventsResult.status === "fulfilled") {
      const apiEvents = eventsResult.value;
      try {
        const store = await ensureEventStore();
        store.upsertEvents(apiEvents);
        lastEvents = await loadStoredEvents();
      } catch (err: unknown) {
        log(`Event store sync failed: ${err instanceof Error ? err.message : String(err)}`);
        lastEvents = apiEvents;
      }
      await refreshConversationTitles(lastEvents ?? []);
    } else if (eventsResult.status === "rejected") {
      log(`Usage events fetch failed: ${eventsResult.reason}`);
    }

    if (spendResult.status === "fulfilled") {
      lastDailySpend = spendResult.value;
    } else if (spendResult.status === "rejected") {
      log(`Daily spend fetch failed: ${spendResult.reason}`);
    }

    const data = dataResult.status === "fulfilled" ? dataResult.value : null;
    if (dataResult.status === "rejected") {
      log(`Usage data fetch failed: ${dataResult.reason}`);
    }

    if (data) {
      const eventsForEnrichment = lastEvents ?? [];
      const enriched = enrichUsageFromEvents(data, eventsForEnrichment, Date.now());
      lastData = enriched;
      lastError = null;
      updateStatusBar(enriched);
    } else {
      lastError = "Could not fetch usage data";
      const locale = getLocale();
      if (!lastData) {
        statusBarItem.text = `$(warning) ${t(locale, "usageUnavailable")}`;
        statusBarItem.tooltip = t(locale, "fetchError");
      } else {
        statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
      }
    }

    DashboardPanel.currentPanel?.postState(getDashboardState());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Error in updateUsage: ${msg}`);
    lastError = msg;
    const locale = getLocale();
    if (!lastData) {
      statusBarItem.text = `$(warning) ${t(locale, "usageUnavailable")}`;
      statusBarItem.tooltip = `${t(locale, "errorPrefix")}: ${msg}`;
    } else {
      statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
    }
  } finally {
    isFetching = false;
    lastFetchTime = Date.now();
  }
}

async function showDetails() {
  if (!lastData) {
    const items: string[] = ["Refresh", "Open Dashboard", "Show Logs"];
    const action = await vscode.window.showWarningMessage(
      lastError
        ? `Cursor usage unavailable: ${lastError}`
        : "Cursor usage data is not available yet.",
      ...items,
    );
    if (action === "Refresh") await updateUsage();
    else if (action === "Open Dashboard") await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
    else if (action === "Show Logs") outputChannel.show();
    return;
  }

  const { onDemand, resetsAt } = lastData;
  const onDemandVisible = isOnDemandVisible(onDemand);
  const showPremiumRequests = shouldShowPremiumRequestsQuota(lastData.planInfo, lastData.poolUsage);

  let message = `${formatStatusBarUsageText(lastData, {
    onDemandVisible,
    showPremiumRequests,
    currency: getCurrency(),
    locale: getLocale(),
  })}`;
  if (resetsAt) message += ` | ${formatResetCountdown(resetsAt, getLocale())}`;

  const action = await vscode.window.showInformationMessage(
    message,
    "Open Dashboard",
    "Refresh",
  );

  if (action === "Open Dashboard") {
    await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
  } else if (action === "Refresh") {
    await updateUsage();
  }
}

async function openDurationSetting() {
  await vscode.commands.executeCommand("workbench.action.openSettings", "cursorUsage.usageDuration");
}

function getDashboardState(): DashboardState {
  const now = Date.now();
  return buildDashboardState(
    lastData,
    getDashboardEvents(now),
    lastDailySpend ?? [],
    isTeamMemberCached(),
    lastError,
    now,
    getConfig().quotaAwareEventDisplay,
    conversationPreviewEnabled ? conversationTitles : {},
    storedEventCount,
  );
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  conversationPreviewEnabled = isConversationPreviewEnabled();
  outputChannel = vscode.window.createOutputChannel("Cursor Usage");
  log("Extension activating...");

  configure({ logger: log });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = OPEN_DASHBOARD_COMMAND;
  statusBarItem.text = "$(loading~spin) Usage";
  statusBarItem.show();

  const showDetailsCmd = vscode.commands.registerCommand("cursor-usage.showDetails", showDetails);
  const refreshCmd = vscode.commands.registerCommand("cursor-usage.refresh", updateUsage);
  const openDurationSettingCmd = vscode.commands.registerCommand(OPEN_DURATION_SETTING_COMMAND, openDurationSetting);
  const openDashboardCmd = vscode.commands.registerCommand(OPEN_DASHBOARD_COMMAND, () => {
    DashboardPanel.createOrShow(
      context,
      updateUsage,
      getDashboardState,
      () => {
        if (lastData) updateStatusBar(lastData);
      },
      handleConversationPreviewChange,
    );
    DashboardPanel.currentPanel?.postState(getDashboardState());
  });

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      lastData
      && (e.affectsConfiguration("cursorUsage.minimalMode")
        || e.affectsConfiguration("cursorUsage.usageDuration")
        || e.affectsConfiguration("cursorUsage.modelBreakdownSortBy")
        || e.affectsConfiguration("cursorUsage.modelBreakdownSortOrder")
        || e.affectsConfiguration("cursorUsage.excludeZeroTokenModels")
        || e.affectsConfiguration("cursorUsage.quotaAwareEventDisplay"))
    ) {
      updateStatusBar(lastData);
      DashboardPanel.currentPanel?.postState(getDashboardState());
    }
  });

  const docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.scheme === "file") {
      scheduleRefresh();
    }
  });

  const focusListener = vscode.window.onDidChangeWindowState(refreshOnFocus);

  const themeListener = vscode.window.onDidChangeActiveColorTheme(() => {
    if (lastData) updateStatusBar(lastData);
  });

  context.subscriptions.push(
    statusBarItem, showDetailsCmd, refreshCmd, openDurationSettingCmd, openDashboardCmd,
    configListener, docChangeListener, focusListener, themeListener,
    outputChannel,
  );

  log("Extension activated, fetching initial usage...");
  updateUsage();
}

export function deactivate() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  eventStore?.close();
  eventStore = null;
}
