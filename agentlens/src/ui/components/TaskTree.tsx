import React from 'react';
import type { SubTask } from '../../common/types';

interface Props {
  tasks: SubTask[];
  currentTaskIndex: number;
}

export const TaskTree: React.FC<Props> = ({ tasks, currentTaskIndex }) => {
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <p>No tasks detected yet.</p>
        <p className="hint">Start a Claude Code session to see tasks appear here.</p>
      </div>
    );
  }

  return (
    <ul className="task-list">
      {tasks.map((task, idx) => {
        const isActive = idx === currentTaskIndex && task.status === 'in_progress';
        const statusClass = `task-marker task-marker-${task.status}`;

        return (
          <li key={task.id} className={`task-item ${isActive ? 'task-active' : ''} task-row-${task.status}`}>
            <span className={statusClass}>
              {task.status === 'completed' && '✓'}
              {task.status === 'failed' && '✗'}
              {task.status === 'pending' && ''}
              {task.status === 'in_progress' && ''}
            </span>
            <span className="task-title">{task.title}</span>
            <span className={`task-badge task-badge-${task.status}`}>
              {task.status === 'in_progress' && '进行中'}
              {task.status === 'pending' && '待处理'}
              {task.status === 'completed' && '完成'}
              {task.status === 'failed' && '失败'}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
