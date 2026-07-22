import type { SubTask } from '../common/types';
import crypto from 'crypto';

export function buildTaskTree(
  tasksFromTodoWrite: SubTask[],
  existingTasks: SubTask[],
): { tasks: SubTask[]; currentTaskIndex: number } {
  if (tasksFromTodoWrite.length === 0) {
    if (existingTasks.length === 0) {
      return { tasks: [], currentTaskIndex: 0 };
    }
    const allDone = existingTasks.map((t) => ({
      ...t,
      status: 'completed' as const,
      completedAt: t.completedAt || Date.now(),
    }));
    return { tasks: allDone, currentTaskIndex: allDone.length };
  }

  const merged = mergeTasks(existingTasks, tasksFromTodoWrite);
  const currentIdx = merged.findIndex((t) => t.status === 'in_progress');
  return {
    tasks: merged,
    currentTaskIndex: currentIdx >= 0 ? currentIdx : merged.length - 1,
  };
}

function mergeTasks(prev: SubTask[], incoming: SubTask[]): SubTask[] {
  const result: SubTask[] = prev.map((t) => ({ ...t }));

  for (const task of incoming) {
    // Three-level match:
    // 1) exact id match
    // 2) exact title match
    // 3) fuzzy title match (longest common prefix ratio >= 0.5)
    const existing = findBestMatch(result, task);

    if (existing) {
      existing.status = task.status;
      existing.title = task.title; // adopt latest wording
      if (task.status === 'in_progress' && !existing.startedAt) {
        existing.startedAt = task.startedAt || Date.now();
      }
      if (task.status === 'completed') {
        existing.completedAt = task.completedAt || Date.now();
      }
    } else {
      result.push({
        ...task,
        id: task.id || hashTitle(task.title),
        startedAt: task.status === 'in_progress' ? (task.startedAt || Date.now()) : task.startedAt,
      });
    }
  }

  return result;
}

function findBestMatch(candidates: SubTask[], needle: SubTask): SubTask | undefined {
  // 1) exact id
  if (needle.id) {
    const byId = candidates.find((t) => t.id === needle.id);
    if (byId) return byId;
  }

  // 2) exact title
  const byTitle = candidates.find((t) => t.title === needle.title);
  if (byTitle) return byTitle;

  // 3) fuzzy: if a candidate shares >50% common prefix with needle, it's the same task renamed
  let best: SubTask | undefined;
  let bestScore = 0;
  for (const t of candidates) {
    const score = commonPrefixRatio(stripTaskPrefix(t.title), stripTaskPrefix(needle.title));
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  // Only match if at least half the shorter title overlaps, and both are >= 10 chars
  if (best && bestScore >= 0.5) return best;
  return undefined;
}

/** Strip common agent-style prefixes to normalize task titles for comparison. */
function stripTaskPrefix(s: string): string {
  return s
    .replace(/^(Fix|Add|Implement|Build|Create|Write|Run|Git)\s*(:\s*)?/i, '')
    .replace(/[→\->]\s*\d+\/\d+\s*(PASSED|passed)/gi, '')
    .trim();
}

/** Ratio of matching prefix chars to the shorter string's length. */
function commonPrefixRatio(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return 0;
  let i = 0;
  while (i < minLen && a[i] === b[i]) i++;
  return i / Math.max(a.length, b.length);
}

function hashTitle(title: string): string {
  return crypto.createHash('md5').update(title).digest('hex').slice(0, 8);
}
