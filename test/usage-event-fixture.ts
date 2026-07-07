import type { UsageEvent } from "../src/cursor-api";

const baseUsageEvent = {
  spendCents: 0,
  maxMode: false,
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  tokenCostCents: 0,
  cursorTokenFee: 0,
  isTokenBasedCall: false,
  isHeadless: false,
  isChargeable: true,
  conversationId: null,
} satisfies Omit<UsageEvent, "timestamp" | "model" | "kind" | "totalTokens" | "requests">;

export function usageEvent(
  partial: Pick<UsageEvent, "timestamp" | "model" | "kind" | "totalTokens" | "requests"> &
    Partial<Omit<UsageEvent, "timestamp" | "model" | "kind" | "totalTokens" | "requests">>,
): UsageEvent {
  return { ...baseUsageEvent, ...partial };
}

export { baseUsageEvent };
