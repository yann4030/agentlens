import type { ToolCallLog } from '../common/types';
import { generateSignature } from '../common/utils';
import { LOOP_WINDOW_SIZE, LOOP_PATTERN_A_MIN, LOOP_PATTERN_B_MIN } from '../common/constants';

export interface LoopDetectionResult {
  isLoop: boolean;
  confidence: number;
  reason?: string;
}

export function checkLoop(window: ToolCallLog[]): LoopDetectionResult {
  if (window.length < LOOP_PATTERN_A_MIN) {
    return { isLoop: false, confidence: 0 };
  }

  const sigs = window.map(generateSignature);

  const last4 = sigs.slice(-LOOP_PATTERN_A_MIN);
  if (new Set(last4).size === 1) {
    return {
      isLoop: true,
      confidence: 0.95,
      reason: `Detected 4 identical calls: ${last4[0]}`,
    };
  }

  if (window.length >= LOOP_PATTERN_B_MIN) {
    const last6 = sigs.slice(-LOOP_PATTERN_B_MIN);
    if (
      last6[0] === last6[2] && last6[2] === last6[4] &&
      last6[1] === last6[3] && last6[3] === last6[5] &&
      last6[0] !== last6[1]
    ) {
      return {
        isLoop: true,
        confidence: 0.85,
        reason: `Alternating pattern: ${last6[0]} <-> ${last6[1]}`,
      };
    }
  }

  return evaluateSlidingWindow(sigs);
}

function evaluateSlidingWindow(sigs: string[]): LoopDetectionResult {
  const recentWindow = sigs.slice(-LOOP_WINDOW_SIZE);
  const freq = new Map<string, number>();
  for (const s of recentWindow) {
    freq.set(s, (freq.get(s) || 0) + 1);
  }

  let maxCount = 0;
  let maxSig = '';
  for (const [sig, count] of freq) {
    if (count > maxCount) {
      maxCount = count;
      maxSig = sig;
    }
  }

  const confidence = maxCount / recentWindow.length;

  if (confidence >= 0.6 && recentWindow.length >= 5) {
    return {
      isLoop: false,
      confidence,
      reason: confidence >= 0.7
        ? `Warning: ${maxSig} appears ${maxCount}/${recentWindow.length} times (${Math.round(confidence * 100)}%)`
        : undefined,
    };
  }

  return { isLoop: false, confidence };
}

export function shouldAlert(status: { isLoop: boolean; confidence: number }): boolean {
  return status.isLoop || status.confidence >= 0.7;
}
