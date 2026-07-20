import { createHash } from "crypto";
import type { UsageEvent } from "./cursor-api-types";

export function usageEventFingerprint(event: UsageEvent): string {
  const payload = JSON.stringify({
    timestamp: event.timestamp,
    model: event.model,
    kind: event.kind,
    conversationId: event.conversationId ?? "",
    totalTokens: event.totalTokens,
    spendCents: event.spendCents,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cacheWriteTokens: event.cacheWriteTokens,
    cacheReadTokens: event.cacheReadTokens,
    tokenCostCents: event.tokenCostCents,
    cursorTokenFee: event.cursorTokenFee,
    maxMode: event.maxMode,
    isTokenBasedCall: event.isTokenBasedCall,
    isHeadless: event.isHeadless,
    isChargeable: event.isChargeable,
  });
  return createHash("sha256").update(payload).digest("hex");
}
