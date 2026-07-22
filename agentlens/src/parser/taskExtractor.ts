import type { SubTask } from '../common/types';

export function buildTaskTree(
  tasksFromTodoWrite: SubTask[],
  existingTasks: SubTask[],
): { tasks: SubTask[]; currentTaskIndex: number } {
  // The latest TodoWrite IS the authoritative task list.
  // Only preserve startedAt/completedAt from previous version of the same task.

  const prevMap = new Map(existingTasks.map((t) => [t.title, t]));

  const tasks = tasksFromTodoWrite.map((t) => {
    const prev = prevMap.get(t.title);
    return {
      ...t,
      startedAt: t.status === 'in_progress'
        ? (prev?.startedAt || t.startedAt || Date.now())
        : (prev?.startedAt || t.startedAt),
      completedAt: t.status === 'completed'
        ? (prev?.completedAt || t.completedAt || Date.now())
        : (prev?.completedAt || t.completedAt),
    };
  });

  const currentIdx = tasks.findIndex((t) => t.status === 'in_progress');
  return {
    tasks,
    currentTaskIndex: currentIdx >= 0 ? currentIdx : tasks.length - 1,
  };
}
