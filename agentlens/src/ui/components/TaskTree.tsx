import React, { useState } from 'react';
import type { SubTask, SessionStatus, ToolCallLog } from '../../common/types';

interface Props {
  tasks: SubTask[];
  currentTaskIndex: number;
  sessionStatus: SessionStatus;
  activeTool?: ToolCallLog;
  recentTools: ToolCallLog[];
}

export const TaskTree: React.FC<Props> = ({ tasks, currentTaskIndex, sessionStatus, activeTool, recentTools }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (tasks.length === 0) {
    return <EmptyState status={sessionStatus} activeTool={activeTool} recentTools={recentTools} />;
  }

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  return (
    <ul className="task-list">
      {tasks.map((task, idx) => {
        const isActive = idx === currentTaskIndex && task.status === 'in_progress';
        const isExpanded = expanded.has(task.id);
        const statusClass = `task-marker task-marker-${task.status}`;

        return (
          <li key={task.id} className={`task-item ${isActive ? 'task-active' : ''} task-row-${task.status}`}>
            <div className="task-row" onClick={() => toggle(task.id)}>
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
            </div>
            {isExpanded && (
              <div className="task-detail">
                {task.startedAt && (
                  <div className="task-detail-row">
                    <span className="task-detail-label">Started</span>
                    <span>{formatTime(task.startedAt)}</span>
                  </div>
                )}
                {task.completedAt && (
                  <div className="task-detail-row">
                    <span className="task-detail-label">Completed</span>
                    <span>{formatTime(task.completedAt)}</span>
                  </div>
                )}
                {task.startedAt && task.completedAt && (
                  <div className="task-detail-row">
                    <span className="task-detail-label">Duration</span>
                    <span>{formatDuration(task.completedAt - task.startedAt)}</span>
                  </div>
                )}
                {task.startedAt && !task.completedAt && task.status === 'in_progress' && (
                  <div className="task-detail-row">
                    <span className="task-detail-label">Elapsed</span>
                    <span className="task-elapsed">{formatDuration(Date.now() - task.startedAt)}</span>
                  </div>
                )}
                {task.relatedFiles && task.relatedFiles.length > 0 && (
                  <div className="task-detail-row">
                    <span className="task-detail-label">Files</span>
                    <span className="task-detail-files">
                      {task.relatedFiles.map((f) => (
                        <code key={f} className="task-detail-file">{f}</code>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function EmptyState({ status, activeTool, recentTools }: { status: SessionStatus; activeTool?: ToolCallLog; recentTools: ToolCallLog[] }) {
  switch (status) {
    case 'working':
      return (
        <div className="empty-state">
          <p>Agent is working...</p>
          {activeTool ? (
            <div className="active-tool-preview">
              <span className="active-tool-name">{activeTool.toolName}</span>
              <span className="active-tool-summary">{activeTool.summary}</span>
            </div>
          ) : recentTools.length > 0 ? (
            <div className="active-tool-preview">
              <span className="active-tool-name">Last: {recentTools[recentTools.length - 1].toolName}</span>
              <span className="active-tool-summary">{recentTools[recentTools.length - 1].summary}</span>
            </div>
          ) : null}
          <p className="hint">Claude Code is exploring — no structured tasks yet.</p>
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
