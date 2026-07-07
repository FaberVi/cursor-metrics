import { randomBytes } from "crypto";
import * as vscode from "vscode";
import {
  CONVERSATION_PREVIEW_KEY,
  DASHBOARD_CURRENCY_KEY,
  DASHBOARD_LOCALE_KEY,
  isDashboardCurrency,
  isDashboardLocale,
  type DashboardCurrency,
  type DashboardLocale,
} from "./dashboard-locale";
import { getDashboardLocale } from "./dashboard-locale-state";
import { getDashboardCurrency } from "./dashboard-currency-state";
import { loadConversationMessages } from "./conversation-messages";
import type { UsageDuration } from "./model-breakdown";
import type { DashboardState, UsageFilter } from "./dashboard-state";

export const OPEN_DASHBOARD_COMMAND = "cursor-usage.openDashboard";

type RefreshFn = () => Promise<void>;
type StateProvider = () => DashboardState | null;
type LocaleChangeFn = (locale: DashboardLocale) => void;
type PreviewChangeFn = (enabled: boolean) => void | Promise<void>;

type DashboardEventFilter = {
  range: UsageDuration;
  usageFilter: UsageFilter;
};

function isUsageDuration(value: unknown): value is UsageDuration {
  return value === "1d" || value === "7d" || value === "30d" || value === "billingCycle";
}

function isUsageFilter(value: unknown): value is UsageFilter {
  return value === "all" || value === "included" || value === "ondemand";
}

function makeNonce(): string {
  return randomBytes(16).toString("base64url");
}

export class DashboardPanel {
  static currentPanel: DashboardPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    onRefresh: RefreshFn,
    getState: StateProvider,
    onLocaleChange?: LocaleChangeFn,
    onPreviewChange?: PreviewChangeFn,
  ): DashboardPanel {
  if (DashboardPanel.currentPanel) {
    DashboardPanel.currentPanel.updateCallbacks(onLocaleChange, onPreviewChange);
    DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
    return DashboardPanel.currentPanel;
  }

    const panel = vscode.window.createWebviewPanel(
      "cursorUsageDashboard",
      "Cursor Usage",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, context, onRefresh, getState, onLocaleChange, onPreviewChange);
    return DashboardPanel.currentPanel;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private onLocaleChange?: LocaleChangeFn;
  private onPreviewChange?: PreviewChangeFn;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly getState: StateProvider;
  private dashboardPrefs: DashboardEventFilter = {
    range: "billingCycle",
    usageFilter: "all",
  };

  static getDashboardEventFilter(): DashboardEventFilter | null {
    return DashboardPanel.currentPanel?.dashboardPrefs ?? null;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    onRefresh: RefreshFn,
    getState: StateProvider,
    onLocaleChange?: LocaleChangeFn,
    onPreviewChange?: PreviewChangeFn,
  ) {
    this.panel = panel;
    this.context = context;
    this.getState = getState;
    this.onLocaleChange = onLocaleChange;
    this.onPreviewChange = onPreviewChange;
    this.panel.webview.html = this.renderHtml(panel.webview, context.extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "ready") {
          const savedLocale = this.context.globalState.get<DashboardLocale>(DASHBOARD_LOCALE_KEY);
          if (isDashboardLocale(savedLocale)) {
            this.panel.webview.postMessage({ type: "init", locale: savedLocale });
          }
          const savedCurrency = this.context.globalState.get<DashboardCurrency>(DASHBOARD_CURRENCY_KEY);
          if (isDashboardCurrency(savedCurrency)) {
            this.panel.webview.postMessage({ type: "initCurrency", currency: savedCurrency });
          }
          const previewEnabled = this.context.globalState.get<boolean>(CONVERSATION_PREVIEW_KEY) === true;
          this.panel.webview.postMessage({ type: "initPreview", enabled: previewEnabled });
          const state = getState();
          if (state) this.postState(state);
        } else if (msg.type === "setLocale" && isDashboardLocale(msg.locale)) {
          await this.context.globalState.update(DASHBOARD_LOCALE_KEY, msg.locale);
          this.onLocaleChange?.(msg.locale);
        } else if (msg.type === "setCurrency" && isDashboardCurrency(msg.currency)) {
          await this.context.globalState.update(DASHBOARD_CURRENCY_KEY, msg.currency);
          this.onLocaleChange?.(getDashboardLocale(this.context));
        } else if (msg.type === "setConversationPreview" && typeof msg.enabled === "boolean") {
          this.panel.webview.postMessage({ type: "previewLoading", on: true });
          try {
            if (this.onPreviewChange) {
              await this.onPreviewChange(msg.enabled);
            } else {
              this.panel.webview.postMessage({
                type: "previewStatus",
                enabled: msg.enabled,
                titleCount: 0,
                conversationCount: 0,
                error: "handler_unavailable",
              });
            }
          } finally {
            this.panel.webview.postMessage({ type: "previewLoading", on: false });
          }
        } else if (msg.type === "syncDashboardPrefs") {
          if (isUsageDuration(msg.range)) this.dashboardPrefs.range = msg.range;
          if (isUsageFilter(msg.usageFilter)) this.dashboardPrefs.usageFilter = msg.usageFilter;
          const state = this.getState();
          if (state) this.postState(state);
        } else if (msg.type === "getConversationMessages" && typeof msg.conversationId === "string") {
          try {
            const conversationEvents = this.getState()?.events.filter(
              (event) => event.conversationId === msg.conversationId,
            ) ?? [];
            const messages = await loadConversationMessages(
              msg.conversationId,
              this.context.extensionPath,
              conversationEvents,
            );
            this.panel.webview.postMessage({
              type: "conversationMessages",
              conversationId: msg.conversationId,
              messages,
            });
          } catch (err: unknown) {
            this.panel.webview.postMessage({
              type: "conversationMessages",
              conversationId: msg.conversationId,
              messages: [],
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else if (msg.type === "refresh") {
          this.postLoading(true);
          try {
            await onRefresh();
          } finally {
            this.postLoading(false);
          }
        }
      },
      null,
      this.disposables,
    );
  }

  postState(state: DashboardState): void {
    this.panel.webview.postMessage({
      type: "state",
      state,
      locale: getDashboardLocale(this.context),
      currency: getDashboardCurrency(this.context),
    });
  }

  postLoading(on: boolean): void {
    this.panel.webview.postMessage({ type: "loading", on });
  }

  postPreviewStatus(enabled: boolean, titleCount: number, conversationCount: number): void {
    this.panel.webview.postMessage({
      type: "previewStatus",
      enabled,
      titleCount,
      conversationCount,
    });
  }

  updateCallbacks(onLocaleChange?: LocaleChangeFn, onPreviewChange?: PreviewChangeFn): void {
    if (onLocaleChange) this.onLocaleChange = onLocaleChange;
    if (onPreviewChange) this.onPreviewChange = onPreviewChange;
  }

  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }

  private renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const mediaUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "dashboard", file));

    const cssUri = mediaUri("dashboard.css");
    const jsUri = mediaUri("dashboard.js");
    const chartUri = mediaUri("chart.umd.js");
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cursor Usage</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <header class="dashboard-header">
    <h1>Cursor Usage</h1>
    <div class="header-actions">
      <span id="last-updated" class="muted"></span>
      <select id="currency-select" class="header-select" aria-label="Currency">
        <option value="usd">USD ($)</option>
        <option value="eur">EUR (€)</option>
      </select>
      <select id="lang-select" class="header-select" aria-label="Language">
        <option value="en">EN</option>
        <option value="it">IT</option>
      </select>
      <button id="refresh-btn" type="button" data-i18n="refresh">Refresh</button>
    </div>
  </header>

  <section class="plan-banner hidden" id="plan-banner" aria-live="polite"></section>

  <section class="summary-cards" id="summary-cards"></section>

  <section class="controls">
    <div class="range-selector" id="range-selector" role="tablist">
      <button data-range="1d" type="button" data-i18n="range.1d">Last 24 hours</button>
      <button data-range="7d" type="button" data-i18n="range.7d">Last 7 days</button>
      <button data-range="30d" type="button" data-i18n="range.30d">Last 30 days</button>
      <button data-range="billingCycle" type="button" data-i18n="range.billingCycle">Current Billing Cycle</button>
    </div>
  </section>

  <section class="chart-section collapsible-section" data-section="usage">
    <div class="chart-header">
      <div class="section-title-row" data-toggle-section="usage">
        <button
          type="button"
          class="section-toggle"
          data-toggle-section="usage"
          aria-expanded="true"
          aria-controls="section-body-usage"
          aria-label="Toggle Your Usage section"
          data-i18n-aria="toggleUsage"
        >
          <svg class="section-arrow" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div>
          <h2 data-i18n="section.usage.title">Your Usage</h2>
          <p class="muted" data-i18n="section.usage.desc">Per-day usage over the selected range</p>
        </div>
      </div>
      <div class="chart-filters">
        <label><span data-i18n="filter.usage.label">Usage:</span>
          <select id="usage-filter">
            <option value="all" data-i18n="filter.all">All</option>
            <option value="included" data-i18n="filter.included">Included</option>
            <option value="ondemand" data-i18n="filter.ondemand">On-Demand</option>
          </select>
        </label>
        <label><span data-i18n="filter.metric.label">Metric:</span>
          <select id="metric-filter">
            <option value="spend" data-i18n="metric.spend">Spend</option>
            <option value="tokens" data-i18n="metric.tokens" selected>Tokens</option>
            <option value="requests" data-i18n="metric.requests">Requests</option>
          </select>
        </label>
      </div>
    </div>
    <div id="section-body-usage" class="section-body">
      <div class="chart-wrapper">
        <canvas id="usage-chart"></canvas>
      </div>
      <p id="chart-note" class="muted small"></p>
    </div>
  </section>

  <section class="chart-section collapsible-section hidden" data-section="pool">
    <div class="chart-header">
      <div class="section-title-row" data-toggle-section="pool">
        <button
          type="button"
          class="section-toggle"
          data-toggle-section="pool"
          aria-expanded="true"
          aria-controls="section-body-pool"
          aria-label="Toggle Pool Usage section"
          data-i18n-aria="togglePool"
        >
          <svg class="section-arrow" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div>
          <h2 data-i18n="section.pool.title">Pool Usage</h2>
          <p class="muted" data-i18n="section.pool.desc">Daily Auto and API pool consumption for the billing cycle</p>
        </div>
      </div>
    </div>
    <div id="section-body-pool" class="section-body">
      <div class="chart-wrapper">
        <canvas id="pool-chart"></canvas>
      </div>
      <div class="pool-pace-header">
        <h3 data-i18n="pool.pace.title">Daily balance</h3>
        <p class="muted" data-i18n="pool.pace.desc">Positive bars = budget left that day; negative = overspend vs even spread until reset</p>
      </div>
      <div class="chart-wrapper chart-wrapper-compact">
        <canvas id="pool-pace-chart"></canvas>
      </div>
      <p id="pool-chart-note" class="muted small"></p>
    </div>
  </section>

  <section class="model-breakdown-section collapsible-section" data-section="breakdown">
    <div class="events-header">
      <div class="section-title-row" data-toggle-section="breakdown">
        <button
          type="button"
          class="section-toggle"
          data-toggle-section="breakdown"
          aria-expanded="true"
          aria-controls="section-body-breakdown"
          aria-label="Toggle Usage by Model section"
          data-i18n-aria="toggleBreakdown"
        >
          <svg class="section-arrow" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <h2 data-i18n="section.breakdown.title">Usage by Model</h2>
      </div>
      <span class="muted small" id="breakdown-range-label"></span>
    </div>
    <div id="section-body-breakdown" class="section-body">
      <div class="table-scroll">
        <table id="breakdown-table">
          <thead>
            <tr>
              <th data-sort="model" class="sortable" data-i18n="col.model">Model</th>
              <th data-sort="requests" class="sortable num" data-i18n="col.requests">Requests</th>
              <th data-sort="totalTokens" class="sortable num" data-i18n="col.tokens">Tokens</th>
              <th data-sort="spendCents" class="sortable num" data-i18n="col.spend">Spend</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="events-section collapsible-section" data-section="events">
    <div class="events-header">
      <div class="section-title-row" data-toggle-section="events">
        <button
          type="button"
          class="section-toggle"
          id="activity-section-toggle"
          data-toggle-section="events"
          aria-expanded="true"
          aria-controls="section-body-events"
          aria-label="Toggle Events section"
        >
          <svg class="section-arrow" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <h2 id="activity-section-title">Events</h2>
      </div>
      <div class="events-toolbar">
        <div class="activity-tabs" role="tablist" aria-label="Activity view">
          <button type="button" class="activity-tab active" data-activity-tab="events" role="tab" aria-selected="true" data-i18n="tab.events">Events</button>
          <button type="button" class="activity-tab" data-activity-tab="conversations" role="tab" aria-selected="false" data-i18n="tab.conversations">Conversations</button>
        </div>
        <div class="events-toolbar-actions">
          <button id="conversation-preview-btn" type="button" class="preview-toggle hidden" aria-pressed="false" data-i18n="preview.titles">Fetch Titles (Preview)</button>
          <span id="preview-status" class="preview-status muted small hidden" aria-live="polite"></span>
          <button id="export-csv" type="button" data-i18n="export.csv">Export CSV</button>
        </div>
      </div>
    </div>
    <div id="section-body-events" class="section-body">
      <p id="archive-note" class="muted small hidden"></p>
      <div id="events-panel" class="activity-panel">
        <div class="table-scroll">
          <table id="events-table">
          <thead>
            <tr>
              <th data-sort="timestamp" class="sortable" data-i18n="col.date">Date</th>
              <th data-sort="kind" class="sortable" data-i18n="col.type">Type</th>
              <th data-sort="model" class="sortable" data-i18n="col.model">Model</th>
              <th data-sort="totalTokens" class="sortable num" data-i18n="col.tokens">Tokens</th>
              <th data-sort="requests" class="sortable num" data-i18n="col.requests">Requests</th>
              <th data-sort="spendCents" class="sortable num" data-i18n="col.spend">Spend</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
      </div>
      <div id="conversations-panel" class="activity-panel hidden">
        <div class="table-scroll">
          <table id="conversations-table">
            <thead>
              <tr>
                <th data-sort="label" class="sortable" data-i18n="col.conversation">Conversation</th>
                <th data-sort="lastTimestamp" class="sortable" data-i18n="col.lastActive">Last active</th>
                <th data-sort="models" class="sortable" data-i18n="col.models">Models</th>
                <th data-sort="eventCount" class="sortable num" data-i18n="col.calls">Calls</th>
                <th data-sort="totalTokens" class="sortable num" data-i18n="col.tokens">Tokens</th>
                <th data-sort="requests" class="sortable num" data-i18n="col.requests">Requests</th>
                <th data-sort="spendCents" class="sortable num" data-i18n="col.spend">Spend</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="pagination" id="conversations-pagination"></div>
      </div>
    </div>
  </section>

  <div id="error-banner" class="error-banner hidden"></div>

  <div id="event-detail-overlay" class="event-detail-overlay hidden" aria-hidden="true">
    <div class="event-detail-panel" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
      <div class="event-detail-header">
        <div>
          <h2 id="event-detail-title" data-i18n="event.details">Event details</h2>
          <p id="event-detail-subtitle" class="muted small"></p>
        </div>
        <button id="event-detail-close" type="button" aria-label="Close event details" data-i18n-aria="closeEventDetails">×</button>
      </div>
      <div id="event-detail-body" class="event-detail-body"></div>
    </div>
  </div>

  <script nonce="${nonce}" src="${chartUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
