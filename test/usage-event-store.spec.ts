import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { normalizeUsageEventRequests } from "../src/cursor-usage-parsing";
import { usageEvent } from "./usage-event-fixture";
import { usageEventFingerprint } from "../src/usage-event-fingerprint";
import { UsageEventStore } from "../src/usage-event-store";

describe("usageEventFingerprint", () => {
  it("produces different hashes when spend differs", () => {
    const base = usageEvent({ timestamp: 1, model: "gpt-5", kind: "Included", totalTokens: 100 });
    const a = usageEventFingerprint(base);
    const b = usageEventFingerprint({ ...base, spendCents: 12 });
    expect(a).not.toBe(b);
  });

  it("produces different hashes when cache tokens differ", () => {
    const base = usageEvent({ timestamp: 1, model: "gpt-5", kind: "Included", totalTokens: 100 });
    const a = usageEventFingerprint(base);
    const b = usageEventFingerprint({ ...base, cacheReadTokens: 500 });
    expect(a).not.toBe(b);
  });

  it("ignores derived requests field so normalization does not change identity", () => {
    const base = usageEvent({
      timestamp: 1,
      model: "gpt-5",
      kind: "Included",
      totalTokens: 100,
      isTokenBasedCall: true,
      requests: 29_648_584,
    });
    const normalized = normalizeUsageEventRequests(base);
    expect(usageEventFingerprint(base)).toBe(usageEventFingerprint(normalized));
  });
});

describe("UsageEventStore", () => {
  const extensionPath = process.cwd();

  it("inserts distinct events and ignores duplicates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cursor-usage-store-"));
    const store = new UsageEventStore(dir, extensionPath);
    await store.init();

    const eventA = usageEvent({
      timestamp: 1_700_000_000_000,
      model: "gpt-5",
      kind: "Included",
      totalTokens: 100,
      spendCents: 0,
    });
    const eventB = usageEvent({
      timestamp: 1_700_000_000_000,
      model: "gpt-5",
      kind: "Included",
      totalTokens: 100,
      spendCents: 25,
    });

    expect(store.upsertEvents([eventA])).toBe(1);
    expect(store.upsertEvents([eventA])).toBe(0);
    expect(store.upsertEvents([eventB])).toBe(1);
    expect(store.getEventCount()).toBe(2);

    const loaded = store.getEventsSince(0);
    expect(loaded).toHaveLength(2);
    expect(loaded.some((e) => e.spendCents === 25)).toBe(true);

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not duplicate when requests are normalized to the same logical event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cursor-usage-store-"));
    const store = new UsageEventStore(dir, extensionPath);
    await store.init();

    const polluted = usageEvent({
      timestamp: 1_700_000_000_000,
      model: "gpt-5",
      kind: "Included",
      totalTokens: 100,
      isTokenBasedCall: true,
      requests: 29_648_584,
      spendCents: 0,
    });
    const normalized = normalizeUsageEventRequests(polluted);

    expect(store.upsertEvents([polluted])).toBe(1);
    expect(store.upsertEvents([normalized])).toBe(0);
    expect(store.getEventCount()).toBe(1);

    const loaded = store.getEventsSince(0);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.requests).toBe(1);

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("migrates legacy rows with polluted requests on first init", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cursor-usage-store-"));
    const legacy = new UsageEventStore(dir, extensionPath);
    await legacy.init();

    const polluted = usageEvent({
      timestamp: 1_700_000_000_001,
      model: "claude-4.6-sonnet",
      kind: "Included",
      totalTokens: 50_000,
      isTokenBasedCall: true,
      requests: 29_648_584,
      spendCents: 0,
    });
    legacy.upsertEvents([polluted]);
    legacy.close();

    const reopened = new UsageEventStore(dir, extensionPath);
    await reopened.init();
    expect(reopened.getEventCount()).toBe(1);
    const loaded = reopened.getEventsSince(0);
    expect(loaded[0]!.requests).toBe(1);

    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
