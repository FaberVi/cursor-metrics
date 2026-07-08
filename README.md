# Cursor Usage (Community)

Community-maintained fork of [cursor-metrics](https://github.com/wrick17/cursor-metrics). See Cursor usage in your status bar: included requests, Auto/API pool usage, and on-demand spend, live while you work. Click the status bar item to open a full dashboard inside your editor.

![Cursor Usage extension tooltip](media/extensions-tooltip.png)

![Cursor Usage dashboard](media/extensions-dashboard.png)

## What you get

### Status bar

- Compact display depends on your plan:
  - **Team / Enterprise (pool-based):** for example `61% Auto, 100% API, $12.50`
  - **Legacy personal (request-based):** for example `42/500, $0.00`
- On pool-based plans, Auto and API show how much of each included pool has been consumed (First-party vs third-party models).
- Detailed hover tooltip with progress bars, included pool breakdown (Auto/API), **daily budget** (allowance and residual for Auto/API today), reset countdown, and per-model usage.
- Loading indicator while fresh usage data is being fetched.
- Smart refresh behavior tied to editor activity and window focus.
- Optional minimal mode to show only the active metric.

### Dashboard

- **Summary cards** for on-demand spend and included pools (Auto / API / total). Legacy request-quota card appears only on older personal plans without pool data.
- **Included pool card extras** (Team / Enterprise):
  - Projected date each pool hits 100% at the current average consumption rate since cycle start.
  - **Target usage** — cumulative target if spread evenly until reset, compared with actual Auto/API usage.
  - **Daily budget** — daily allowance bar with residual headroom or overspend vs an even spread.
- **Pool Usage section** (when pool data is available):
  - Cumulative Auto/API % line chart for the billing cycle.
  - **Daily balance** chart — positive bars = budget left that day; negative = overspend vs even spread.
- **Your Usage** — stacked per-day bar chart (spend, tokens, or requests) with range tabs and usage filters.
  - Chart tooltip includes per-model values **and daily pool %** (Auto/API consumed that day).
- **Usage by Model** — sortable breakdown table with chart-matched colors.
- **Events** — paginated, sortable event log with token breakdown modal and CSV export.
- **Language selector** (`EN` / `IT`) in the header next to Refresh; choice is persisted.
- Collapsible sections with persisted open/closed state.

## Commands

- `Cursor Usage (Community): Open Dashboard` — open the in-editor dashboard.
- `Cursor Usage (Community): Show Details` — show a quick usage summary message.
- `Cursor Usage (Community): Refresh` — force a refresh immediately.

## Settings

- `cursorUsage.pollInterval` (default: `5`) — minimum refresh cooldown in minutes (`1`, `5`, `10`, `30`, `60`).
- `cursorUsage.minimalMode` (default: `false`) — when included usage is exhausted (pool total on Team/Enterprise, or legacy request quota on older personal plans), show only on-demand spend in the status bar instead of the full summary.
- `cursorUsage.usageDuration` (default: `billingCycle`) — tooltip model-usage range: `1d`, `7d`, `30d`, or `billingCycle`.
- `cursorUsage.modelBreakdownSortBy` (default: `tokens`) — sort column for usage-by-model tables: `model`, `requests`, `tokens`, `spend`.
- `cursorUsage.modelBreakdownSortOrder` (default: `desc`) — `asc` or `desc`.
- `cursorUsage.excludeZeroTokenModels` (default: `false`) — hide model rows with zero tokens in the tooltip breakdown.
- `cursorUsage.quotaAwareEventDisplay` (default: `true`) — in the dashboard, show included usage as requests and on-demand usage as spend instead of raw charged cents on every row.

## Pool pacing (how to read it)

All pool pacing views are **indicative** — they assume an even spread of the 100% pool budget across the billing cycle:

| View | What it shows |
|------|----------------|
| **Daily budget** | Daily allowance and how much is still available today (or by how much you overshot it). Shown in the status bar tooltip and dashboard pool card. |
| **Target usage** | Where cumulative Auto/API usage *should* be today to reach reset without early depletion (dashboard pool card). |
| **Daily balance chart** | Per-day headroom (+) or overspend (−) relative to that even spread. |
| **Projected 100%** | When each pool would hit 100% if the average daily rate since cycle start continues. |
| **Chart tooltip pool %** | Auto and API pool percentage consumed on that specific day. |

Daily pool percentages are derived from included usage events (`default` model → Auto pool; other models → API pool) and calibrated against the live totals from Cursor's usage API.

## Privacy and behavior

- No manual API key setup required.
- Uses your existing signed-in Cursor session locally.
- Fetches on activity (editing/focus) instead of constant polling.
- Caches auth and API responses to avoid redundant requests.

## Development

```bash
bun install
bun run build      # production build
bun run watch      # extension + dashboard watch mode
bun test           # run tests
```

Press **F5** in VS Code/Cursor with the **Run Cursor Usage Extension** launch config to debug in an Extension Development Host.

## Authors & maintainers

- **Created by** [wrick17](https://github.com/wrick17) — original extension and [cursor-metrics](https://github.com/wrick17/cursor-metrics) repository.
- **Maintained by** [Vincenzo Fabiano (FaberVi)](https://github.com/FaberVi) — community fork, pool analytics, dashboard i18n, pacing projections, and ongoing improvements. Published on the VS Marketplace as [fabervi](https://marketplace.visualstudio.com/publishers/fabervi).

## License

MIT
