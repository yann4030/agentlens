import type { CostRates } from './types';

const RATES: CostRates = {
  'claude-sonnet-4': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4': { input: 15.0, output: 75.0, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-opus-4-8': { input: 15.0, output: 75.0, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-haiku-4-5': { input: 0.80, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  'claude-fable-5': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-sonnet-5': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'default': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
};

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  model?: string,
): number {
  const rate = findRate(model?.toLowerCase());
  const cost =
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output +
    (cacheReadTokens / 1_000_000) * rate.cacheRead +
    (cacheCreationTokens / 1_000_000) * rate.cacheWrite;
  return Math.round(cost * 10000) / 10000;
}

function findRate(model?: string) {
  if (!model) return RATES['default'];
  for (const key of Object.keys(RATES)) {
    if (key === 'default') continue;
    if (model.includes(key)) return RATES[key];
  }
  return RATES['default'];
}
