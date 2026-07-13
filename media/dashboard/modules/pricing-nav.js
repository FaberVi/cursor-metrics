import { local, persistLocal, switchMainTab, ui } from "./core.js";
import {
  estimateComponentCost,
  resolveModelPricing,
  resolveModelPricingDetailed,
} from "../../../src/model-pricing.ts";
import { updateCalculator } from "./pricing-calculator.js";
import { renderPricing } from "./pricing-render.js";
import { getEstimateOpts } from "./pricing-shared.js";

export function navigateToModelPricing(modelId) {
  const entry = resolveModelPricing(modelId);
  local.highlightModelId = entry?.id ?? modelId;
  local.pricingUsedOnly = false;
  if (entry) {
    local.pricingSearch = entry.displayName;
  } else {
    local.pricingSearch = modelId;
  }
  persistLocal();
  if (ui.pricingSearch) ui.pricingSearch.value = local.pricingSearch;
  if (ui.pricingUsedOnly) ui.pricingUsedOnly.checked = false;
  switchMainTab("pricing");
  renderPricing();
  window.setTimeout(() => {
    const highlightRow = ui.pricingBody?.querySelector(".pricing-row-highlight");
    if (highlightRow) {
      highlightRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, 50);
  window.setTimeout(() => {
    local.highlightModelId = null;
    persistLocal();
    renderPricing();
  }, 3000);
}

export function bindPricingHandlers() {
  if (ui.pricingSearch) {
    ui.pricingSearch.addEventListener("input", () => {
      local.pricingSearch = ui.pricingSearch.value;
      persistLocal();
      renderPricing();
    });
  }
  if (ui.pricingProviderFilter) {
    ui.pricingProviderFilter.addEventListener("change", () => {
      local.pricingProvider = ui.pricingProviderFilter.value;
      persistLocal();
      renderPricing();
    });
  }
  if (ui.pricingPoolFilter) {
    ui.pricingPoolFilter.addEventListener("change", () => {
      local.pricingPool = ui.pricingPoolFilter.value;
      persistLocal();
      renderPricing();
    });
  }
  if (ui.pricingUsedOnly) {
    ui.pricingUsedOnly.addEventListener("change", () => {
      local.pricingUsedOnly = ui.pricingUsedOnly.checked;
      persistLocal();
      renderPricing();
    });
  }
  if (ui.pricingHead) {
    ui.pricingHead.addEventListener("click", (e) => {
      const th = e.target.closest("th.sortable");
      if (!th) return;
      const key = th.dataset.sort;
      if (local.pricingSortKey === key) {
        local.pricingSortOrder = local.pricingSortOrder === "asc" ? "desc" : "asc";
      } else {
        local.pricingSortKey = key;
        local.pricingSortOrder = key === "displayName" || key === "provider" ? "asc" : "desc";
      }
      persistLocal();
      renderPricing();
    });
  }
  if (ui.pricingBody) {
    ui.pricingBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-expand-model]");
      if (!btn) return;
      const modelId = btn.dataset.expandModel;
      const detailRow = ui.pricingBody.querySelector('[data-detail-for="' + modelId + '"]');
      if (!detailRow) return;
      const open = detailRow.hidden;
      ui.pricingBody.querySelectorAll(".pricing-detail-row").forEach((row) => {
        row.hidden = true;
      });
      ui.pricingBody.querySelectorAll(".pricing-expand-btn").forEach((b) => {
        b.setAttribute("aria-expanded", "false");
        b.textContent = "▸";
      });
      if (open) {
        detailRow.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        btn.textContent = "▾";
        local.pricingExpandedId = modelId;
        updateCalculator(detailRow);
      } else {
        local.pricingExpandedId = null;
      }
      persistLocal();
    });
    ui.pricingBody.addEventListener("input", (e) => {
      const input = e.target.closest("[data-calc-field]");
      if (!input) return;
      const detailRow = input.closest(".pricing-detail-row");
      if (detailRow) updateCalculator(detailRow);
    });
  }
}

export function getEventPricingEstimate(event) {
  const resolved = resolveModelPricingDetailed(event.model, !!event.maxMode);
  if (!resolved) return null;
  const breakdown = estimateComponentCost(
    resolved.effectiveRates,
    {
      inputTokens: event.inputTokens || 0,
      outputTokens: event.outputTokens || 0,
      cacheWriteTokens: event.cacheWriteTokens || 0,
      cacheReadTokens: event.cacheReadTokens || 0,
    },
    getEstimateOpts(),
  );
  return { entry: resolved.entry, variant: resolved.variant, breakdown };
}
