import type { SubTask, ToolCallLog } from '../common/types';
import { shortId } from '../common/utils';

export function buildTaskTree(
  tasksFromTodoWrite: SubTask[],
  existingTasks: SubTask[],
): { tasks: SubTask[]; currentTaskIndex: number } {
  if (tasksFromTodoWrite.length === 0) {
    if (existingTasks.length > 0) {
      return { tasks: existingTasks, currentTaskIndex: 0 };
    }
    return emptyTaskTree();
  }

  const currentIdx = tasksFromTodoWrite.findIndex((t) => t.status === 'in_progress');
  return {
    tasks: tasksFromTodoWrite,
    currentTaskIndex: currentIdx >= 0 ? currentIdx : 0,
  };
}

function emptyTaskTree(): { tasks: SubTask[]; currentTaskIndex: number } {
  return {
    tasks: [
      {
        id: shortId(),
        title: 'Agent Session',
        status: 'in_progress',
        startedAt: Date.now(),
      },
    ],
    currentTaskIndex: 0,
  };
}

export function mergeTasks(prev: SubTask[], next: SubTask[]): SubTask[] {
  const prevMap = new Map(prev.map((t) => [t.id, t]));
  for (const task of next) {
    const existing = prevMap.get(task.id);
    if (existing) {
      existing.status = task.status;
      if (task.status === 'in_progress' && !existing.startedAt) {
        existing.startedAt = task.startedAt;
      }
      if (task.status === 'completed') {
        existing.completedAt = task.completedAt || Date.now();
      }
    } else {
      prevMap.set(task.id, task);
    }
  }
  return Array.from(prevMap.values());
}
