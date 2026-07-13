import type { UsageEvent } from "./cursor-api-types";
import type { UsageDuration } from "./model-breakdown";
import { getDurationCutoff } from "./model-breakdown";
import rawCatalog from "./data/model-pricing.json";

export type TokenRatesPerMillion = {
  input?: number;
  cacheWrite?: number;
  cacheRead?: number;
  output?: number;
  inputPlusCacheWrite?: number;
};

export type ModelPool = "firstParty" | "api";

export type VariantPriceImpact =
  | "sameRateMoreTokens"
  | "rateMultiplier"
  | "inputMultiplier"
  | "customRates"
  | "separateModel";

export type ModelPricingVariant = {
  id: string;
  label: string;
  aliases?: string[];
  priceImpact: VariantPriceImpact;
  rateMultiplier?: number;
  inputRateMultiplier?: number;
  rates?: TokenRatesPerMillion;
  separateModelId?: string;
  description?: string;
  legacyNote?: string;
  requiresMaxMode?: boolean;
};

export type ModelPricingEntry = {
  id: string;
  displayName: string;
  provider: string;
  pool: ModelPool;
  rates: TokenRatesPerMillion;
  aliases?: string[];
  variants?: ModelPricingVariant[];
  hidden?: boolean;
  notes?: string;
  docsUrl?: string;
};

export type ResolvedModelPricing = {
  entry: ModelPricingEntry;
  variant: ModelPricingVariant | null;
  effectiveRates: TokenRatesPerMillion;
};

export type PlanPricingInfo = {
  id: string;
  name: string;
  priceMonthly: number;
  apiUsageIncluded: number;
};

export type ModelPricingCatalog = {
  sourceUrl: string;
  lastUpdated: string;
  cursorTokenRatePerMillion: number;
  plans: PlanPricingInfo[];
  models: ModelPricingEntry[];
};

export type ComponentCostBreakdown = {
  inputCents: number;
  cacheWriteCents: number;
  cacheReadCents: number;
  outputCents: number;
  cursorTokenFeeCents: number;
  totalCents: number;
};

export type TheoreticalModelCost = {
  modelId: string;
  eventModelIds: string[];
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  requests: number;
  actualSpendCents: number;
  theoreticalCents: number;
  deltaCents: number;
  deltaPercent: number | null;
};

export type EstimateEventOptions = {
  applyCursorTokenRate?: boolean;
  cursorTokenRatePerMillion?: number;
};

const MILLION = 1_000_000;

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function rateCostCents(tokens: number, ratePerMillion: number | undefined): number {
  if (!tokens || !ratePerMillion) return 0;
  return (tokens / MILLION) * ratePerMillion * 100;
}

function validateCatalog(data: unknown): ModelPricingCatalog {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid model pricing catalog");
  }
  const catalog = data as ModelPricingCatalog;
  if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
    throw new Error("Model pricing catalog has no models");
  }
  for (const entry of catalog.models) {
    if (!entry.rates.output && !entry.rates.inputPlusCacheWrite) {
      throw new Error(`Model ${entry.id} is missing output pricing`);
    }
  }
  return catalog;
}

let cachedCatalog: ModelPricingCatalog | null = null;
let aliasIndex: Map<string, ResolvedModelPricing> | null = null;

function applyRateMultiplier(
  rates: TokenRatesPerMillion,
  multiplier: number,
  inputOnly = false,
): TokenRatesPerMillion {
  const scale = (value: number | undefined) =>
    value === undefined ? undefined : value * multiplier;
  if (inputOnly) {
    return {
      ...rates,
      input: scale(rates.input),
      inputPlusCacheWrite: scale(rates.inputPlusCacheWrite),
    };
  }
  return {
    input: scale(rates.input),
    cacheWrite: scale(rates.cacheWrite),
    cacheRead: scale(rates.cacheRead),
    output: scale(rates.output),
    inputPlusCacheWrite: scale(rates.inputPlusCacheWrite),
  };
}

function resolveEffectiveRates(
  entry: ModelPricingEntry,
  variant: ModelPricingVariant | null,
  maxMode = false,
): TokenRatesPerMillion {
  if (variant?.priceImpact === "separateModel" && variant.separateModelId) {
    const separate = getModelPricingCatalog().models.find((m) => m.id === variant.separateModelId);
    if (separate) return separate.rates;
  }
  if (variant?.priceImpact === "customRates" && variant.rates) {
    return variant.rates;
  }

  let rates = entry.rates;
  if (variant?.priceImpact === "rateMultiplier" && variant.rateMultiplier) {
    rates = applyRateMultiplier(rates, variant.rateMultiplier);
  }
  if (variant?.priceImpact === "inputMultiplier" && variant.inputRateMultiplier) {
    rates = applyRateMultiplier(rates, variant.inputRateMultiplier, true);
  }
  if (variant?.requiresMaxMode && !maxMode) {
    return rates;
  }
  if (maxMode) {
    const maxVariant = entry.variants?.find((v) => v.id === "max-long-context");
    if (maxVariant?.inputRateMultiplier) {
      rates = applyRateMultiplier(rates, maxVariant.inputRateMultiplier, true);
    }
  }
  return rates;
}

function buildAliasIndex(catalog: ModelPricingCatalog): Map<string, ResolvedModelPricing> {
  const index = new Map<string, ResolvedModelPricing>();
  for (const entry of catalog.models) {
    const baseResolved: ResolvedModelPricing = {
      entry,
      variant: null,
      effectiveRates: entry.rates,
    };
    index.set(normalizeModelId(entry.id), baseResolved);
    for (const alias of entry.aliases ?? []) {
      index.set(normalizeModelId(alias), baseResolved);
    }
    for (const variant of entry.variants ?? []) {
      const variantResolved: ResolvedModelPricing = {
        entry,
        variant,
        effectiveRates: resolveEffectiveRates(entry, variant),
      };
      for (const alias of variant.aliases ?? []) {
        index.set(normalizeModelId(alias), variantResolved);
      }
    }
  }
  return index;
}

export function getModelPricingCatalog(): ModelPricingCatalog {
  if (!cachedCatalog) {
    cachedCatalog = validateCatalog(rawCatalog);
    aliasIndex = buildAliasIndex(cachedCatalog);
  }
  return cachedCatalog;
}

export function resolveModelPricingDetailed(
  modelId: string,
  maxMode = false,
): ResolvedModelPricing | null {
  getModelPricingCatalog();
  if (!aliasIndex) return null;
  const resolved = aliasIndex.get(normalizeModelId(modelId));
  if (!resolved) return null;
  return {
    ...resolved,
    effectiveRates: resolveEffectiveRates(resolved.entry, resolved.variant, maxMode),
  };
}

export function resolveModelPricing(modelId: string): ModelPricingEntry | null {
  return resolveModelPricingDetailed(modelId)?.entry ?? null;
}

export function formatVariantPriceImpact(variant: ModelPricingVariant): string {
  if (variant.priceImpact === "sameRateMoreTokens") {
    return "same $/M, more tokens";
  }
  if (variant.priceImpact === "rateMultiplier" && variant.rateMultiplier) {
    return variant.rateMultiplier + "× all rates";
  }
  if (variant.priceImpact === "inputMultiplier" && variant.inputRateMultiplier) {
    return variant.inputRateMultiplier + "× input";
  }
  if (variant.priceImpact === "customRates") {
    return "custom rates";
  }
  if (variant.priceImpact === "separateModel" && variant.separateModelId) {
    return "→ " + variant.separateModelId;
  }
  return variant.priceImpact;
}

export function estimateComponentCost(
  rates: TokenRatesPerMillion,
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  },
  opts: EstimateEventOptions = {},
): ComponentCostBreakdown {
  let inputCents = 0;
  let cacheWriteCents = 0;

  if (rates.inputPlusCacheWrite !== undefined) {
    const promptTokens = tokens.inputTokens + tokens.cacheWriteTokens;
    inputCents = rateCostCents(promptTokens, rates.inputPlusCacheWrite);
  } else {
    inputCents = rateCostCents(tokens.inputTokens, rates.input);
    cacheWriteCents = rateCostCents(tokens.cacheWriteTokens, rates.cacheWrite);
  }

  const cacheReadCents = rateCostCents(tokens.cacheReadTokens, rates.cacheRead);
  const outputCents = rateCostCents(tokens.outputTokens, rates.output);

  const componentTotal = inputCents + cacheWriteCents + cacheReadCents + outputCents;
  const totalTokens =
    tokens.inputTokens + tokens.outputTokens + tokens.cacheWriteTokens + tokens.cacheReadTokens;
  const cursorTokenFeeCents =
    opts.applyCursorTokenRate && totalTokens > 0
      ? rateCostCents(totalTokens, opts.cursorTokenRatePerMillion ?? getModelPricingCatalog().cursorTokenRatePerMillion)
      : 0;

  return {
    inputCents,
    cacheWriteCents,
    cacheReadCents,
    outputCents,
    cursorTokenFeeCents,
    totalCents: componentTotal + cursorTokenFeeCents,
  };
}

export function estimateEventTheoreticalCost(
  event: Pick<
    UsageEvent,
    | "model"
    | "inputTokens"
    | "outputTokens"
    | "cacheWriteTokens"
    | "cacheReadTokens"
    | "totalTokens"
    | "maxMode"
  >,
  entry: ModelPricingEntry,
  opts: EstimateEventOptions = {},
): ComponentCostBreakdown {
  const resolved = resolveModelPricingDetailed(event.model, event.maxMode);
  const rates = resolved?.effectiveRates ?? entry.rates;
  return estimateComponentCost(
    rates,
    {
      inputTokens: event.inputTokens ?? 0,
      outputTokens: event.outputTokens ?? 0,
      cacheWriteTokens: event.cacheWriteTokens ?? 0,
      cacheReadTokens: event.cacheReadTokens ?? 0,
    },
    opts,
  );
}

export function formatRateUsd(rate: number | undefined): string {
  if (rate === undefined) return "—";
  return "$" + rate.toFixed(rate < 1 ? 3 : 2);
}

export function aggregateTheoreticalByModel(
  events: UsageEvent[],
  duration: UsageDuration,
  resetAtIso: string | null,
  now: number,
  opts: EstimateEventOptions = {},
): { usedModelIds: string[]; theoreticalByModel: Record<string, TheoreticalModelCost> } {
  const cutoff = getDurationCutoff(duration, resetAtIso, now);
  const byCanonical = new Map<string, TheoreticalModelCost>();

  for (const event of events) {
    if (event.timestamp < cutoff) continue;
    const entry = resolveModelPricing(event.model);
    if (!entry) continue;

    const estimate = estimateEventTheoreticalCost(event, entry, opts);
    const existing = byCanonical.get(entry.id) ?? {
      modelId: entry.id,
      eventModelIds: [],
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      requests: 0,
      actualSpendCents: 0,
      theoreticalCents: 0,
      deltaCents: 0,
      deltaPercent: null,
    };

    if (!existing.eventModelIds.includes(event.model)) {
      existing.eventModelIds.push(event.model);
    }
    existing.totalTokens += event.totalTokens || 0;
    existing.inputTokens += event.inputTokens || 0;
    existing.outputTokens += event.outputTokens || 0;
    existing.cacheWriteTokens += event.cacheWriteTokens || 0;
    existing.cacheReadTokens += event.cacheReadTokens || 0;
    existing.requests += event.requests || 0;
    existing.actualSpendCents += event.spendCents || 0;
    existing.theoreticalCents += estimate.totalCents;
    byCanonical.set(entry.id, existing);
  }

  const theoreticalByModel: Record<string, TheoreticalModelCost> = {};
  const usedModelIds: string[] = [];

  for (const [modelId, row] of byCanonical.entries()) {
    row.deltaCents = row.actualSpendCents - row.theoreticalCents;
    row.deltaPercent =
      row.theoreticalCents > 0 ? (row.deltaCents / row.theoreticalCents) * 100 : null;
    theoreticalByModel[modelId] = row;
    usedModelIds.push(...row.eventModelIds);
  }

  return {
    usedModelIds: [...new Set(usedModelIds)].sort(),
    theoreticalByModel,
  };
}
