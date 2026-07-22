import crypto from 'crypto';
import type { ToolCallLog } from './types';

export function generateSignature(tool: ToolCallLog): string {
  const target = tool.filePath || tool.command || '';
  const cleanTarget = target.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${tool.toolName}:${cleanTarget}`;
}

export function hashString(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

export function shortId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function nowMs(): number {
  return Date.now();
}
