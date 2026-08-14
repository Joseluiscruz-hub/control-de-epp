import type { AriaDataDocument } from "@/lib/aria-context";

export type AriaRawData = {
  inventory: AriaDataDocument[];
  employees: AriaDataDocument[];
  assignments: AriaDataDocument[];
  budgetGoal: Record<string, unknown> | null;
  assignmentSampleLimited: boolean;
};

type CacheEntry = {
  data: AriaRawData;
  cachedAt: number;
};

const CACHE_TTL_MS = 3 * 60 * 1_000;
const MAX_ENTRIES = 8;

const cache = new Map<string, CacheEntry>();
const inFlightLoads = new Map<string, Promise<AriaRawData>>();

function isFresh(entry: CacheEntry, now = Date.now()) {
  return now - entry.cachedAt <= CACHE_TTL_MS;
}

export function getCachedAriaData(key: string, now = Date.now()): AriaRawData | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (!isFresh(entry, now)) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedAriaData(key: string, data: AriaRawData, now = Date.now()): void {
  if (!cache.has(key) && cache.size >= MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [candidateKey, entry] of cache) {
      if (entry.cachedAt < oldestAt) {
        oldestAt = entry.cachedAt;
        oldestKey = candidateKey;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, cachedAt: now });
}

export async function getOrLoadAriaData(
  key: string,
  loader: () => Promise<AriaRawData>,
): Promise<AriaRawData> {
  const cached = getCachedAriaData(key);
  if (cached) return cached;

  const existingLoad = inFlightLoads.get(key);
  if (existingLoad) return existingLoad;

  const load = loader()
    .then((data) => {
      setCachedAriaData(key, data);
      return data;
    })
    .finally(() => {
      inFlightLoads.delete(key);
    });

  inFlightLoads.set(key, load);
  return load;
}

export function invalidateAriaCache(key?: string): void {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
}

export function getAriaCacheStats(now = Date.now()) {
  return {
    entries: cache.size,
    inFlight: inFlightLoads.size,
    keys: [...cache.entries()].map(([key, entry]) => ({
      key,
      ageSeconds: Math.max(0, Math.round((now - entry.cachedAt) / 1_000)),
    })),
  };
}
