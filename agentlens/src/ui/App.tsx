import React, { useState, useEffect } from 'react';
import type { AgentSessionState, SessionStatus } from '../common/types';
import { TaskTree } from './components/TaskTree';
import { ToolFeed } from './components/ToolFeed';
import { WatchdogBanner } from './components/WatchdogBanner';
import { TokenBar } from './components/TokenBar';
import { FileTree } from './components/FileTree';
import { StatusBadge } from './components/StatusBadge';
import { ToolUsageChart } from './components/ToolUsageChart';
import { HealthCard } from './components/HealthCard';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

const EMPTY: AgentSessionState = {
  sessionId: '', projectName: '', startTime: 0, lastUpdatedTime: 0,
  currentTaskIndex: 0, tasks: [], recentTools: [],
  watchdog: { isNormal: true, loopDetected: false, stallDetected: false, loopConfidence: 0, lastHeartbeat: 0 },
  tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, timeline: [], estimatedCost: 0 },
  files: [], availableSessions: [], currentSessionPath: '',
  sessionStatus: 'no_session', lastTodoWriteAt: 0,
  health: { loopCount: 0, stallCount: 0, toolCallCount: 0, startTime: 0, lastToolTime: 0 },
};

type Tab = 'tasks' | 'tools' | 'files' | 'insights';

export default function App() {
  const [state, setState] = useState<AgentSessionState>(EMPTY);
  const [activeView, setActiveView] = useState<Tab>('tasks');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'state_update' || message.type === 'state_init') {
        setState(message.payload as AgentSessionState);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ command: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const completedCount = state.tasks.filter((t) => t.status === 'completed').length;
  const totalTokens = state.tokens.inputTokens + state.tokens.outputTokens;

  const handleReset = () => {
    vscode.postMessage({ command: 'reset' });
  };

  return (
    <div className="app">
      <WatchdogBanner watchdog={state.watchdog} />

      <header className="app-header">
        <h1 className="app-title">AgentLens</h1>
        <StatusBadge status={state.sessionStatus} />
        {state.sessionId && (
          <span className="session-id" title={state.sessionId}>
            {state.sessionId.slice(0, 8)}...
          </span>
        )}
        <button className="reset-btn" onClick={handleReset} title="Full Reset">↻</button>
      </header>

      <div className="stats-bar">
        <span className="stat">Tasks: {completedCount}/{state.tasks.length}</span>
        {state.activeToolCall && (
          <span className="stat stat-active" title={state.activeToolCall.summary}>
            Running: {state.activeToolCall.toolName}
          </span>
        )}
        {totalTokens > 0 && (
          <span className="stat">{totalTokens.toLocaleString()} tokens</span>
        )}
      </div>

      <TokenBar tokens={state.tokens} />

      <nav className="tab-bar">
        {(['tasks', 'tools', 'files', 'insights'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab ${activeView === tab ? 'tab-active' : ''}`}
            onClick={() => setActiveView(tab)}
          >
            {{ tasks: 'Tasks', tools: 'Tools', files: 'Files', insights: 'Insights' }[tab]}
          </button>
        ))}
      </nav>

      <main className="main-content">
        {activeView === 'tasks' && (
          <TaskTree tasks={state.tasks} currentTaskIndex={state.currentTaskIndex} sessionStatus={state.sessionStatus} activeTool={state.activeToolCall} recentTools={state.recentTools} />
        )}
        {activeView === 'tools' && (
          <ToolFeed tools={state.recentTools} activeTool={state.activeToolCall} />
        )}
        {activeView === 'files' && (
          <FileTree files={state.files} vscode={vscode} />
        )}
        {activeView === 'insights' && (
          <div className="insights-panel">
            <HealthCard health={state.health} />
            <ToolUsageChart tools={state.recentTools} />
          </div>
        )}
      </main>
    </div>
  );
}
