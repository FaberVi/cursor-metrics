export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_USAGE_EVENT_PAGES = 10;
export const MAX_STORE_SYNC_PAGES = 100;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function withTimeout(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function nextMonth(iso: string): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export function parseTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) return asNum;
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) return asDate;
  }
  return 0;
}

export function getBillingCycleCutoff(resetAtIso: string | null, now: number): number {
  if (!resetAtIso) return now - 31 * 86_400_000;
  const resetAt = new Date(resetAtIso);
  if (Number.isNaN(resetAt.getTime())) return now - 31 * 86_400_000;
  resetAt.setMonth(resetAt.getMonth() - 1);
  return resetAt.getTime();
}
