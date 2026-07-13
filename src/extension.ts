import * as vscode from "vscode";
import { configure } from "./cursor-api";
import { DashboardPanel, OPEN_DASHBOARD_COMMAND } from "./dashboard-panel";
import { OPEN_DURATION_SETTING_COMMAND } from "./tooltip";
import {
  cleanupExtensionRefresh,
  getDashboardState,
  handleConversationPreviewChange,
  initExtensionRefresh,
  log,
  refreshOnFocus,
  refreshStatusBarFromLastData,
  scheduleRefresh,
  showDetails,
  updateUsage,
} from "./extension-refresh";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Cursor Usage");
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = OPEN_DASHBOARD_COMMAND;
  statusBarItem.text = "$(loading~spin) Usage";
  statusBarItem.show();

  initExtensionRefresh(context, statusBarItem, outputChannel);

  configure({ logger: log });
  log("Extension activating...");

  const showDetailsCmd = vscode.commands.registerCommand("cursor-usage.showDetails", showDetails);
  const refreshCmd = vscode.commands.registerCommand("cursor-usage.refresh", updateUsage);
  const openDurationSettingCmd = vscode.commands.registerCommand(
    OPEN_DURATION_SETTING_COMMAND,
    () => vscode.commands.executeCommand("workbench.action.openSettings", "cursorUsage.usageDuration"),
  );
  const openDashboardCmd = vscode.commands.registerCommand(OPEN_DASHBOARD_COMMAND, () => {
    DashboardPanel.createOrShow(
      context,
      updateUsage,
      getDashboardState,
      refreshStatusBarFromLastData,
      handleConversationPreviewChange,
    );
    DashboardPanel.currentPanel?.postState(getDashboardState());
  });

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("cursorUsage.minimalMode")
      || e.affectsConfiguration("cursorUsage.usageDuration")
      || e.affectsConfiguration("cursorUsage.modelBreakdownSortBy")
      || e.affectsConfiguration("cursorUsage.modelBreakdownSortOrder")
      || e.affectsConfiguration("cursorUsage.excludeZeroTokenModels")
      || e.affectsConfiguration("cursorUsage.quotaAwareEventDisplay")
    ) {
      refreshStatusBarFromLastData();
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
    refreshStatusBarFromLastData();
  });

  context.subscriptions.push(
    statusBarItem,
    showDetailsCmd,
    refreshCmd,
    openDurationSettingCmd,
    openDashboardCmd,
    configListener,
    docChangeListener,
    focusListener,
    themeListener,
    outputChannel,
  );

  log("Extension activated, fetching initial usage...");
  updateUsage();
}

export function deactivate() {
  cleanupExtensionRefresh();
}
