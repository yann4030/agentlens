import React, { useState, useEffect } from 'react';
import type { AgentSessionState, StateChange, ToolCallLog, SubTask, WatchdogStatus } from '../common/types';
import { TaskTree } from './components/TaskTree';
import { ToolFeed } from './components/ToolFeed';
import { WatchdogBanner } from './components/WatchdogBanner';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

const initialState: AgentSessionState = {
  sessionId: '',
  projectName: '',
  startTime: 0,
  lastUpdatedTime: 0,
  currentTaskIndex: 0,
  tasks: [],
  recentTools: [],
  watchdog: {
    isNormal: true,
    loopDetected: false,
    stallDetected: false,
    loopConfidence: 0,
    lastHeartbeat: 0,
  },
};

export default function App() {
  const [state, setState] = useState<AgentSessionState>(initialState);
  const [activeView, setActiveView] = useState<'tasks' | 'tools'>('tasks');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'state_init' || message.type === 'state_update') {
        setState(message.payload as AgentSessionState);
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const completedCount = state.tasks.filter((t) => t.status === 'completed').length;
  const inProgressCount = state.tasks.filter((t) => t.status === 'in_progress').length;

  return (
    <div className="app">
      <WatchdogBanner watchdog={state.watchdog} />

      <header className="app-header">
        <h1 className="app-title">AgentLens</h1>
        {state.sessionId && (
          <span className="session-id" title={state.sessionId}>
            {state.sessionId.slice(0, 8)}...
          </span>
        )}
      </header>

      <div className="stats-bar">
        <span className="stat">
          Tasks: {completedCount}/{state.tasks.length}
        </span>
        {state.activeToolCall && (
          <span className="stat stat-active" title={state.activeToolCall.summary}>
            Running: {state.activeToolCall.toolName}
          </span>
        )}
      </div>

      <nav className="tab-bar">
        <button
          className={`tab ${activeView === 'tasks' ? 'tab-active' : ''}`}
          onClick={() => setActiveView('tasks')}
        >
          Tasks
        </button>
        <button
          className={`tab ${activeView === 'tools' ? 'tab-active' : ''}`}
          onClick={() => setActiveView('tools')}
        >
          Tools
        </button>
      </nav>

      <main className="main-content">
        {activeView === 'tasks' ? (
          <TaskTree tasks={state.tasks} currentTaskIndex={state.currentTaskIndex} />
        ) : (
          <ToolFeed tools={state.recentTools} activeTool={state.activeToolCall} />
        )}
      </main>
    </div>
  );
}
