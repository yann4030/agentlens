import type { WatchdogStatus } from '../common/types';
import { nowMs } from '../common/utils';
import { STALL_CHECK_INTERVAL_MS, STALL_WARNING_YELLOW_MS, STALL_WARNING_RED_MS } from '../common/constants';

export interface StallCheckResult {
  isStall: boolean;
  severity: 'normal' | 'warning' | 'critical';
  message?: string;
}

export function checkStall(lastHeartbeat: number): StallCheckResult {
  const elapsed = nowMs() - lastHeartbeat;

  if (elapsed > STALL_WARNING_RED_MS) {
    return {
      isStall: true,
      severity: 'critical',
      message: `Agent stalled for over 2 minutes. Consider restarting the Claude Code session.`,
    };
  }

  if (elapsed > STALL_WARNING_YELLOW_MS) {
    return {
      isStall: true,
      severity: 'warning',
      message: `Agent appears idle (${Math.floor(elapsed / 1000)}s). Waiting for response...`,
    };
  }

  return { isStall: false, severity: 'normal' };
}

export function buildWatchdogStatus(
  lastHeartbeat: number,
  loopDetected: boolean,
  loopConfidence: number,
  loopReason?: string,
): WatchdogStatus {
  const stall = checkStall(lastHeartbeat);

  const warningMessages: string[] = [];
  if (stall.message) warningMessages.push(stall.message);
  if (loopReason) warningMessages.push(loopReason);

  const isNormal = !stall.isStall && !loopDetected;

  return {
    isNormal,
    loopDetected,
    stallDetected: stall.isStall,
    loopConfidence,
    lastHeartbeat,
    warningMessage: warningMessages.length > 0 ? warningMessages.join(' | ') : undefined,
  };
}

export function createStallTimer(callback: () => void): { start: () => void; stop: () => void } {
  let intervalId: NodeJS.Timeout | null = null;

  return {
    start() {
      if (intervalId !== null) return;
      intervalId = setInterval(callback, STALL_CHECK_INTERVAL_MS);
    },
    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
