import React from 'react';
import type { SubTask, SessionStatus } from '../../common/types';

interface Props {
  tasks: SubTask[];
  currentTaskIndex: number;
  sessionStatus: SessionStatus;
}

export const TaskTree: React.FC<Props> = ({ tasks, currentTaskIndex, sessionStatus }) => {
  if (tasks.length === 0) {
    return <EmptyState status={sessionStatus} />;
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

function EmptyState({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'working':
      return (
        <div className="empty-state">
          <p>Agent is working...</p>
          <p className="hint">Waiting for Claude Code to issue tasks.</p>
        </div>
      );
    case 'done':
      return (
        <div className="empty-state">
          <p>Session complete.</p>
          <p className="hint">All tasks finished.</p>
        </div>
      );
    case 'interrupted':
      return (
        <div className="empty-state">
          <p>Session stopped unexpectedly.</p>
          <p className="hint">Check Claude Code terminal.</p>
        </div>
      );
    case 'waiting':
      return (
        <div className="empty-state">
          <p>Waiting for input...</p>
          <p className="hint">Claude Code may be waiting for user response.</p>
        </div>
      );
    case 'no_session':
    default:
      return (
        <div className="empty-state">
          <p>No session detected.</p>
          <p className="hint">Start a Claude Code session in this workspace.</p>
        </div>
      );
  }
}
