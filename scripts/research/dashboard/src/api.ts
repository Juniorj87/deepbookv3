import { MOCK_LIVE, MOCK_HEALTH, MOCK_PREDICTIONS, MOCK_ORACLES, getMockDeviationHistory, getMockTimeline } from './mock-data';

let apiAvailable: boolean | null = null;

export async function apiFetch<T>(path: string, fallback: T): Promise<T> {
  if (apiAvailable === false) return fallback;
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    apiAvailable = true;
    return data;
  } catch {
    apiAvailable = false;
    return fallback;
  }
}

export const MOCK = {
  live: MOCK_LIVE,
  health: MOCK_HEALTH,
  predictions: MOCK_PREDICTIONS,
  oracles: MOCK_ORACLES,
  deviationHistory: getMockDeviationHistory(),
  timeline: getMockTimeline(),
} as const;
