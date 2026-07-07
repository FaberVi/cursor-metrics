import { describe, expect, it } from "bun:test";
import { buildUsageByModelHeadingMarkdown, buildUsageOverviewMarkdown } from "../src/tooltip";

const progressBar = {
  markdown: (ratio: number) => `[bar:${ratio.toFixed(2)}]`,
  html: (ratio: number) => `<bar:${ratio.toFixed(2)}>`,
  divider: () => "<divider />",
};

describe("buildUsageOverviewMarkdown", () => {
  it("renders a balanced two-column summary for limited on-demand spend", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "limited", spendDollars: 66.89, limitDollars: 200 },
        poolUsage: null,
      },
      progressBar,
      "en",
    );

    expect(markdown).toContain("<td><sub>Included</sub></td>");
    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td>");
    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89 / $200.00</strong>");
    expect(markdown).toContain("<bar:1.00>");
    expect(markdown).toContain("<bar:0.33>");
    expect(markdown.match(/<table/g)?.length).toBe(1);
    expect(markdown).not.toContain("width=\"49%\"");
    expect(markdown).not.toContain("100% used");
    expect(markdown).not.toContain("of $200.00 (33%)");
    expect(markdown).not.toContain("Included Requests");
    expect(markdown).not.toContain("On-Demand Spend");
  });

  it("renders on-demand amounts in EUR when currency is eur", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "limited", spendDollars: 66.89, limitDollars: 200 },
        poolUsage: null,
      },
      progressBar,
      "en",
      Date.now(),
      [],
      "eur",
    );

    expect(markdown).toContain("<strong>€61.54 / €184.00</strong>");
  });

  it("renders unlimited copy on the bottom row so the columns stay aligned", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "unlimited", spendDollars: 66.89, limitDollars: null },
        poolUsage: null,
      },
      progressBar,
      "en",
    );

    expect(markdown).toContain("<td><sub>Included</sub></td>");
    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td>");
    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89</strong>");
    expect(markdown).toContain("<bar:1.00>");
    expect(markdown).toContain("<tr><td><bar:1.00></td><td><sub>Unlimited</sub></td></tr>");
    expect(markdown.match(/<table/g)?.length).toBe(1);
    expect(markdown).not.toContain("width=\"49%\"");
    expect(markdown).not.toContain("100% used");
    expect(markdown).not.toContain("No spend cap");
    expect(markdown).not.toContain("Included Requests");
    expect(markdown).not.toContain("On-Demand Spend");
  });

  it("renders a single-column balanced summary when on-demand is hidden", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 42, limit: 500 },
        onDemand: { state: "disabled", spendDollars: 0, limitDollars: null },
        poolUsage: null,
      },
      progressBar,
      "en",
    );

    expect(markdown).toContain("<table width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">");
    expect(markdown).toContain("<td width=\"100%\"><sub>Included</sub></td>");
    expect(markdown).toContain("<strong>42 / 500</strong>");
    expect(markdown).toContain("<bar:0.08>");
    expect(markdown).not.toContain("<divider />");
    expect(markdown).not.toContain("8% used");
    expect(markdown).not.toContain("On-demand");
  });

  it("includes pool usage when provided", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "disabled", spendDollars: 0, limitDollars: null },
        poolUsage: { autoPercentUsed: 46, apiPercentUsed: 4, totalPercentUsed: 31 },
      },
      progressBar,
      "en",
    );

    expect(markdown).toContain("Included pool");
    expect(markdown).toContain("31% total used");
    expect(markdown).toContain("Auto");
    expect(markdown).toContain("API");
  });

  it("includes today's suggested pace when pool usage and events are available", () => {
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const resetsAt = "2026-08-02T15:37:46.000Z";
    const cycleStart = new Date(resetsAt);
    cycleStart.setMonth(cycleStart.getMonth() - 1);
    const events = [
      {
        timestamp: cycleStart.getTime() + 3_600_000,
        model: "default",
        kind: "Included",
        totalTokens: 1000,
        requests: 1,
        spendCents: 100,
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
      },
      {
        timestamp: now - 3_600_000,
        model: "default",
        kind: "Included",
        totalTokens: 1000,
        requests: 1,
        spendCents: 500,
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
      },
    ];

    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "disabled", spendDollars: 0, limitDollars: null },
        poolUsage: { autoPercentUsed: 61.4, apiPercentUsed: 3.7, totalPercentUsed: 40.4 },
        resetsAt,
      },
      progressBar,
      "en",
      now,
      events,
    );

    expect(markdown).toContain("Daily budget");
    expect(markdown).toContain("budget");
    expect(markdown).not.toContain("Recommended pace");
    expect(markdown).not.toContain("Today's suggested pace");
  });
});

describe("buildUsageByModelHeadingMarkdown", () => {
  it("includes a Change link that routes to the duration setting", () => {
    const markdown = buildUsageByModelHeadingMarkdown("billingCycle", "en");

    expect(markdown).toContain("**Usage by Model** *(Current Billing Cycle)*");
    expect(markdown).toContain("[Change](command:cursor-usage.openDurationSetting)");
  });

  it("renders Italian labels when locale is it", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 42, limit: 500 },
        onDemand: { state: "disabled", spendDollars: 0, limitDollars: null },
        poolUsage: null,
      },
      progressBar,
      "it",
    );

    expect(markdown).toContain("<sub>Incluso</sub>");
    expect(markdown).not.toContain("<sub>Included</sub>");
  });
});
