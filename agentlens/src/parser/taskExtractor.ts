import type { SubTask } from '../common/types';

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

  const merged = mergeTasks(existingTasks, tasksFromTodoWrite);

  const currentIdx = merged.findIndex((t) => t.status === 'in_progress');
  return {
    tasks: merged,
    currentTaskIndex: currentIdx >= 0 ? currentIdx : merged.length - 1,
  };
}

function emptyTaskTree(): { tasks: SubTask[]; currentTaskIndex: number } {
  return { tasks: [], currentTaskIndex: 0 };
}

function mergeTasks(prev: SubTask[], incoming: SubTask[]): SubTask[] {
  const prevById = new Map(prev.map((t) => [t.id, t]));
  const prevByContent = new Map(prev.map((t) => [t.title, t]));

  for (const task of incoming) {
    const existing = prevById.get(task.id) || prevByContent.get(task.title);
    if (existing) {
      existing.status = task.status;
      if (task.status === 'in_progress' && !existing.startedAt) {
        existing.startedAt = task.startedAt;
      }
      if (task.status === 'completed') {
        existing.completedAt = task.completedAt || Date.now();
      }
    } else {
      prevById.set(task.id, { ...task });
    }
  }
  return Array.from(prevById.values());
}
