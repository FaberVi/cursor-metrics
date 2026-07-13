import { describe, expect, it } from "bun:test";
import type { UsageEvent } from "../src/cursor-api-types";
import {
  aggregateTheoreticalByModel,
  estimateComponentCost,
  estimateEventTheoreticalCost,
  getModelPricingCatalog,
  resolveModelPricing,
  resolveModelPricingDetailed,
} from "../src/model-pricing";

const baseEvent: UsageEvent = {
  timestamp: Date.now(),
  model: "gpt-5.3-codex",
  kind: "On-Demand",
  totalTokens: 5000,
  requests: 1,
  spendCents: 120,
  maxMode: false,
  inputTokens: 1000,
  outputTokens: 3000,
  cacheWriteTokens: 500,
  cacheReadTokens: 500,
  tokenCostCents: 110,
  cursorTokenFee: 10,
  isTokenBasedCall: true,
  isHeadless: false,
  isChargeable: true,
  conversationId: null,
};

describe("model pricing catalog", () => {
  it("loads and validates all models", () => {
    const catalog = getModelPricingCatalog();
    expect(catalog.models.length).toBeGreaterThan(30);
    expect(catalog.sourceUrl).toContain("cursor.com");
    for (const entry of catalog.models) {
      expect(entry.rates.output || entry.rates.inputPlusCacheWrite).toBeTruthy();
      if (entry.pool === "firstParty") {
        expect(["auto", "composer-2.5", "grok-4.5"]).toContain(entry.id);
      }
    }
  });
});

describe("resolveModelPricing", () => {
  it("resolves composer-2 alias to Composer 2.5", () => {
    const entry = resolveModelPricing("composer-2");
    expect(entry?.id).toBe("composer-2.5");
    expect(entry?.displayName).toBe("Composer 2.5");
  });

  it("resolves default to Auto", () => {
    const entry = resolveModelPricing("default");
    expect(entry?.id).toBe("auto");
  });

  it("resolves thinking variants", () => {
    const entry = resolveModelPricing("claude-4.6-opus-high-thinking");
    expect(entry?.id).toBe("claude-4.6-opus");
    const detailed = resolveModelPricingDetailed("claude-4.6-opus-high-thinking");
    expect(detailed?.variant?.id).toBe("high-thinking");
    expect(detailed?.variant?.priceImpact).toBe("sameRateMoreTokens");
  });

  it("applies custom fast rates for Claude Opus 4.8 fast", () => {
    const detailed = resolveModelPricingDetailed("claude-opus-4-8-fast");
    expect(detailed?.variant?.id).toBe("fast");
    expect(detailed?.effectiveRates.input).toBe(10);
    expect(detailed?.effectiveRates.output).toBe(50);
  });

  it("links GPT-5 high reasoning to same rates", () => {
    const base = resolveModelPricingDetailed("gpt-5");
    const high = resolveModelPricingDetailed("gpt-5-high");
    expect(high?.variant?.priceImpact).toBe("sameRateMoreTokens");
    expect(high?.effectiveRates.output).toBe(base?.effectiveRates.output);
  });

  it("links GPT-5 fast to separate model rates", () => {
    const fast = resolveModelPricingDetailed("gpt-5");
    const separate = resolveModelPricingDetailed("gpt-5-fast");
    expect(separate?.entry.id).toBe("gpt-5-fast");
    expect(separate?.effectiveRates.input).toBe(2.5);
  });
});

describe("estimateComponentCost", () => {
  it("computes per-component cost in cents", () => {
    const entry = resolveModelPricing("gpt-5.3-codex");
    expect(entry).not.toBeNull();
    const breakdown = estimateComponentCost(entry!.rates, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    expect(breakdown.inputCents).toBeCloseTo(175, 0);
    expect(breakdown.totalCents).toBeCloseTo(175, 0);
  });

  it("uses inputPlusCacheWrite for Auto", () => {
    const entry = resolveModelPricing("default");
    expect(entry).not.toBeNull();
    const breakdown = estimateComponentCost(entry!.rates, {
      inputTokens: 500_000,
      outputTokens: 0,
      cacheWriteTokens: 500_000,
      cacheReadTokens: 0,
    });
    expect(breakdown.inputCents).toBeCloseTo(125, 0);
    expect(breakdown.cacheWriteCents).toBe(0);
  });
});

describe("estimateEventTheoreticalCost", () => {
  it("estimates from parsed fixture-like event", () => {
    const event: UsageEvent = {
      timestamp: 1775418973898,
      model: "claude-4.6-opus-high-thinking",
      kind: "On-Demand",
      totalTokens: 177679,
      requests: 30.4,
      spendCents: 124.73,
      maxMode: true,
      inputTokens: 3,
      outputTokens: 20525,
      cacheWriteTokens: 112151,
      cacheReadTokens: 45000,
      tokenCostCents: 121.41,
      cursorTokenFee: 3.32,
      isTokenBasedCall: true,
      isHeadless: false,
      isChargeable: true,
      conversationId: null,
    };
    const entry = resolveModelPricing(event.model);
    expect(entry).not.toBeNull();
    const breakdown = estimateEventTheoreticalCost(event, entry!);
    expect(breakdown.totalCents).toBeGreaterThan(0);
    expect(breakdown.outputCents).toBeGreaterThan(breakdown.inputCents);
  });
});

describe("aggregateTheoreticalByModel", () => {
  const now = Date.parse("2026-07-10T12:00:00.000Z");
  const resetAt = "2026-08-02T15:37:46.000Z";

  it("respects billing cycle cutoff", () => {
    const inCycle = { ...baseEvent, timestamp: now - 2 * 86_400_000 };
    const outOfCycle = { ...baseEvent, timestamp: now - 40 * 86_400_000 };
    const result = aggregateTheoreticalByModel([inCycle, outOfCycle], "billingCycle", resetAt, now);
    const row = result.theoreticalByModel["gpt-5.3-codex"];
    expect(row).toBeDefined();
    expect(row!.totalTokens).toBe(5000);
    expect(result.usedModelIds).toContain("gpt-5.3-codex");
  });

  it("computes delta between actual and theoretical spend", () => {
    const result = aggregateTheoreticalByModel([baseEvent], "30d", resetAt, now);
    const row = result.theoreticalByModel["gpt-5.3-codex"];
    expect(row).toBeDefined();
    expect(row!.actualSpendCents).toBe(120);
    expect(row!.theoreticalCents).toBeGreaterThan(0);
    expect(row!.deltaCents).toBe(row!.actualSpendCents - row!.theoreticalCents);
  });
});
