import type { SetupCache } from "./cursor-api-types";

let cachedSetup: SetupCache | null = null;
let cachedSetupSessionToken: string | null = null;

export function invalidateSetupCache(): void {
  cachedSetup = null;
  cachedSetupSessionToken = null;
}

export function getCachedSetup(sessionToken: string): SetupCache | null {
  if (cachedSetup && cachedSetupSessionToken === sessionToken) {
    return cachedSetup;
  }
  return null;
}

export function storeSetupCache(setup: SetupCache, sessionToken: string): void {
  cachedSetup = setup;
  cachedSetupSessionToken = sessionToken;
}

export function getCachedMaxRequestUsage(): number {
  return cachedSetup?.maxRequestUsage ?? 0;
}

export function isTeamMemberCached(): boolean {
  return cachedSetup?.isTeamMember ?? false;
}
