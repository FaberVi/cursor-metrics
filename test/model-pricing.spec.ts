/// <reference path="../types/bun-test.d.ts" />
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
      expect(entry.rates.output ?? entry.rates.inputPlusCacheWrite).toBeDefined();
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

  it("resolves cursor-grok-4.5-high to Cursor Grok 4.5", () => {
    const detailed = resolveModelPricingDetailed("cursor-grok-4.5-high");
    expect(detailed?.entry.id).toBe("grok-4.5");
    expect(detailed?.variant?.id).toBe("high");
    expect(detailed?.entry.pool).toBe("firstParty");
  });

  it("resolves effort-tier API slugs missing from explicit aliases", () => {
    expect(resolveModelPricing("composer-2.5-fast")?.id).toBe("composer-2.5");
    expect(resolveModelPricingDetailed("claude-fable-5-thinking-high")?.entry.id).toBe("claude-fable-5");
    expect(resolveModelPricingDetailed("claude-fable-5-thinking-xhigh")?.variant?.id).toBe("thinking");
    expect(resolveModelPricing("gpt-5.6-luna-medium")?.id).toBe("gpt-5.6-luna");
    expect(resolveModelPricing("gpt-5.6-terra-medium")?.id).toBe("gpt-5.6-terra");
  });

  it("auto-resolves thinking effort slugs for models with thinking variants", () => {
    const cases: Array<{ slug: string; modelId: string; variantId?: string }> = [
      { slug: "claude-4-sonnet-thinking-high", modelId: "claude-4-sonnet", variantId: "thinking" },
      { slug: "claude-4-sonnet-1m-thinking-xhigh", modelId: "claude-4-sonnet-1m", variantId: "thinking" },
      { slug: "claude-sonnet-5-thinking-medium", modelId: "claude-sonnet-5", variantId: "thinking" },
      { slug: "claude-4.6-sonnet-medium-thinking", modelId: "claude-4.6-sonnet", variantId: "medium-thinking" },
      { slug: "claude-4.6-opus-thinking-high", modelId: "claude-4.6-opus", variantId: "high-thinking" },
    ];
    for (const { slug, modelId, variantId } of cases) {
      const detailed = resolveModelPricingDetailed(slug);
      expect(detailed?.entry.id).toBe(modelId);
      if (variantId) expect(detailed?.variant?.id).toBe(variantId);
    }
  });

  it("falls back to base model rates for thinking slugs without a thinking variant", () => {
    const detailed = resolveModelPricingDetailed("claude-4.5-sonnet-thinking-high");
    expect(detailed?.entry.id).toBe("claude-4.5-sonnet");
    expect(detailed?.variant).toBeNull();
    const cost = estimateEventTheoreticalCost(
      {
        model: "claude-4.5-sonnet-thinking-high",
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 150_000,
        maxMode: false,
      },
      detailed!.entry,
    );
    expect(cost.totalCents).toBeGreaterThan(0);
  });

  it("estimates non-zero theoretical cost for thinking effort slugs", () => {
    const slugs = [
      "claude-fable-5-thinking-xhigh",
      "claude-4-sonnet-thinking-high",
      "gpt-5.6-luna-medium",
    ];
    for (const slug of slugs) {
      const detailed = resolveModelPricingDetailed(slug);
      expect(detailed).not.toBeNull();
      const cost = estimateEventTheoreticalCost(
        {
          model: slug,
          inputTokens: 500_000,
          outputTokens: 200_000,
          cacheWriteTokens: 0,
          cacheReadTokens: 100_000,
          totalTokens: 800_000,
          maxMode: false,
        },
        detailed!.entry,
      );
      expect(cost.totalCents).toBeGreaterThan(0);
    }
  });

  it("estimates non-zero theoretical cost for composer-2.5-fast usage", () => {
    const entry = resolveModelPricing("composer-2.5-fast");
    expect(entry).not.toBeNull();
    const cost = estimateEventTheoreticalCost(
      {
        model: "composer-2.5-fast",
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cacheWriteTokens: 0,
        cacheReadTokens: 2_000_000,
        totalTokens: 3_500_000,
        maxMode: false,
      },
      entry!,
    );
    expect(cost.totalCents).toBeGreaterThan(0);
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

  it("counts only on-demand charges as actual when quota-aware", () => {
    const included: UsageEvent = { ...baseEvent, kind: "Included", spendCents: 500 };
    const onDemand: UsageEvent = { ...baseEvent, kind: "On-Demand", spendCents: 80 };
    const result = aggregateTheoreticalByModel(
      [included, onDemand],
      "30d",
      resetAt,
      now,
      { quotaAwareEventDisplay: true },
    );
    const row = result.theoreticalByModel["gpt-5.3-codex"];
    expect(row).toBeDefined();
    expect(row!.actualSpendCents).toBe(80);
    expect(row!.theoreticalCents).toBeGreaterThan(0);
    expect(row!.deltaCents).toBe(80 - row!.theoreticalCents);
    expect(row!.deltaPercent).not.toBeNull();
  });

  it("omits delta percent when there is no billable actual spend", () => {
    const included: UsageEvent = { ...baseEvent, kind: "Included", spendCents: 500 };
    const result = aggregateTheoreticalByModel(
      [included],
      "30d",
      resetAt,
      now,
      { quotaAwareEventDisplay: true },
    );
    const row = result.theoreticalByModel["gpt-5.3-codex"];
    expect(row).toBeDefined();
    expect(row!.actualSpendCents).toBe(0);
    expect(row!.theoreticalCents).toBeGreaterThan(0);
    expect(row!.deltaPercent).toBeNull();
  });
});
