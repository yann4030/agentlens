import type { SubTask } from '../common/types';
import crypto from 'crypto';

export function buildTaskTree(
  tasksFromTodoWrite: SubTask[],
  existingTasks: SubTask[],
): { tasks: SubTask[]; currentTaskIndex: number } {
  // Empty TodoWrite means "clear all tasks"
  if (tasksFromTodoWrite.length === 0) {
    if (existingTasks.length === 0) {
      return { tasks: [], currentTaskIndex: 0 };
    }
    // Keep existing tasks but mark all as completed
    const allDone = existingTasks.map((t) => ({
      ...t,
      status: t.status === 'completed' ? 'completed' as const : 'completed' as const,
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
  const merged = new Map<string, SubTask>();

  // First, carry over all previous tasks with stable IDs
  for (const t of prev) {
    const key = t.id || hashTitle(t.title);
    merged.set(key, { ...t });
  }

  // Then apply incoming updates, matching by content as fallback
  for (const task of incoming) {
    const key = task.id || hashTitle(task.title);
    const existing = merged.get(key) || findTaskByContent(merged, task.title);

    if (existing) {
      merged.set(existing.id || key, {
        ...existing,
        status: task.status,
        startedAt: task.status === 'in_progress' ? (existing.startedAt || task.startedAt || Date.now()) : existing.startedAt,
        completedAt: task.status === 'completed' ? (task.completedAt || Date.now()) : existing.completedAt,
      });
    } else {
      merged.set(key, {
        ...task,
        id: key,
        startedAt: task.status === 'in_progress' ? (task.startedAt || Date.now()) : task.startedAt,
      });
    }
  }

  return Array.from(merged.values());
}

function findTaskByContent(map: Map<string, SubTask>, title: string): SubTask | undefined {
  for (const t of map.values()) {
    if (t.title === title) return t;
  }
  return undefined;
}

function hashTitle(title: string): string {
  return crypto.createHash('md5').update(title).digest('hex').slice(0, 8);
}
