import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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
});
