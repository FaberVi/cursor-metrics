import type { PlanInfo } from "./plan-labels";

export type { PlanInfo };

export type UsagePayload = {
  includedRequests: { used: number; limit: number };
  onDemand: {
    state: "disabled" | "limited" | "unlimited";
    spendDollars: number;
    limitDollars: number | null;
  };
  poolUsage: {
    autoPercentUsed: number;
    apiPercentUsed: number;
    totalPercentUsed: number;
  } | null;
  resetsAt: string | null;
  planInfo: PlanInfo | null;
};

export type UsageEvent = {
  timestamp: number;
  model: string;
  kind: string;
  totalTokens: number;
  requests: number;
  spendCents: number;
  maxMode: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  tokenCostCents: number;
  cursorTokenFee: number;
  isTokenBasedCall: boolean;
  isHeadless: boolean;
  isChargeable: boolean;
  conversationId: string | null;
};

export type ConversationSummary = {
  conversationId: string | null;
  label: string;
  title: string | null;
  firstTimestamp: number;
  lastTimestamp: number;
  totalTokens: number;
  requests: number;
  spendCents: number;
  eventCount: number;
  models: string[];
  kinds: string[];
};

export type ConversationRow = ConversationSummary & {
  events: UsageEvent[];
  modelsLabel: string;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string | null;
  model: string | null;
  modelEstimated?: boolean;
};

export type DailySpendRow = {
  day: number;
  category: string;
  spendCents: number;
  totalTokens: number;
};

export type AuthInfo = { userId: string; sessionToken: string; email: string | null };

export type RequestTotals = { used: number; limit: number; source: string };

export type NumberWithSource = { value: number; source: string };

export type SetupCache = {
  isTeamMember: boolean;
  teamId?: number;
  maxRequestUsage: number;
  onDemandEnabled: boolean;
  planInfo: PlanInfo | null;
};

export type CursorHeaders = {
  "Content-Type": "application/json";
  Cookie: string;
  Origin: "https://cursor.com";
  Referer: "https://cursor.com/dashboard";
};
