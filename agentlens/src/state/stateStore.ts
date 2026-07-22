import type { AgentSessionState, ToolCallLog, SubTask, StateChange } from '../common/types';
import { nowMs } from '../common/utils';
import { LOOP_WINDOW_SIZE, MAX_RECENT_TOOLS } from '../common/constants';
import { checkLoop, shouldAlert } from '../watchdog/loopDetector';
import { buildWatchdogStatus } from '../watchdog/stallWatchdog';

type StateListener = (change: StateChange) => void;

export class StateStore {
  private state: AgentSessionState;
  private listeners: Set<StateListener> = new Set();

  constructor(id = '') {
    this.state = makeInitialState(id);
  }

  getState(): Readonly<AgentSessionState> {
    return this.state;
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // --- mutations ---

  setSessionId(id: string): void {
    this.state = { ...this.state, sessionId: id };
    this.emit('session_reset', { sessionId: id });
  }

  updateHeartbeat(): void {
    this.state = {
      ...this.state,
      lastUpdatedTime: nowMs(),
      watchdog: { ...this.state.watchdog, lastHeartbeat: nowMs() },
    };
    this.reevaluateWatchdog();
    this.emit('heartbeat', { lastUpdatedTime: this.state.lastUpdatedTime });
  }

  setActiveTool(tool: ToolCallLog): void {
    const tools = [...this.state.recentTools, tool].slice(-MAX_RECENT_TOOLS);
    this.state = {
      ...this.state,
      lastUpdatedTime: nowMs(),
      activeToolCall: tool,
      recentTools: tools,
    };

    this.reevaluateWatchdogAndEmit();
  }

  completeActiveTool(result: ToolCallLog): void {
    const tools = this.state.recentTools.map((t) => {
      if (t.id === result.id || (t.status === 'running' && t.toolName === 'unknown')) {
        return { ...t, status: 'success' as const };
      }
      return t;
    });

    // If the result doesn't match any running tool, append it
    const hasMatch = this.state.recentTools.some(
      (t) => t.id === result.id || (t.status === 'running' && t.toolName === 'unknown'),
    );

    const finalTools = hasMatch ? tools : [...tools, result].slice(-MAX_RECENT_TOOLS);

    this.state = {
      ...this.state,
      lastUpdatedTime: nowMs(),
      activeToolCall: undefined,
      recentTools: finalTools,
    };

    this.reevaluateWatchdogAndEmit();
  }

  setTasks(tasks: SubTask[], currentTaskIndex: number): void {
    const merged = [...this.state.tasks];
    for (const incoming of tasks) {
      const idx = merged.findIndex((t) => t.id === incoming.id);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], status: incoming.status };
        if (incoming.status === 'in_progress' && !merged[idx].startedAt) {
          merged[idx] = { ...merged[idx], startedAt: incoming.startedAt };
        }
        if (incoming.status === 'completed') {
          merged[idx] = { ...merged[idx], completedAt: incoming.completedAt || nowMs() };
        }
      } else {
        merged.push(incoming);
      }
    }

    // Auto-complete tasks before current
    for (let i = currentTaskIndex - 1; i >= 0; i--) {
      if (merged[i] && merged[i].status !== 'completed' && merged[i].status !== 'failed') {
        merged[i] = { ...merged[i], status: 'completed' };
      }
    }

    this.state = { ...this.state, tasks: merged, currentTaskIndex };
    this.emit('tasks_updated', { tasks: this.state.tasks, currentTaskIndex });
  }

  reset(id: string): void {
    this.state = makeInitialState(id);
    this.emit('session_reset', {});
  }

  // --- internal ---

  private reevaluateWatchdog(): void {
    const window = this.state.recentTools.slice(-LOOP_WINDOW_SIZE);
    const result = checkLoop(window);
    this.state = {
      ...this.state,
      watchdog: buildWatchdogStatus(
        this.state.watchdog.lastHeartbeat,
        result.isLoop,
        result.confidence,
        result.reason,
      ),
    };
  }

  private reevaluateWatchdogAndEmit(): void {
    this.reevaluateWatchdog();
    this.emit('tool_started', {
      activeToolCall: this.state.activeToolCall,
      recentTools: this.state.recentTools,
      watchdog: this.state.watchdog,
      lastUpdatedTime: this.state.lastUpdatedTime,
    });

    if (shouldAlert({ isLoop: this.state.watchdog.loopDetected, confidence: this.state.watchdog.loopConfidence })) {
      this.emit('watchdog_changed', { watchdog: this.state.watchdog });
    }
  }

  private emit(type: StateChange['type'], partial: Partial<AgentSessionState>): void {
    for (const fn of this.listeners) {
      try { fn({ type, partial }); } catch { /* drop */ }
    }
  }
}

function makeInitialState(id: string): AgentSessionState {
  return {
    sessionId: id,
    projectName: '',
    startTime: nowMs(),
    lastUpdatedTime: nowMs(),
    currentTaskIndex: 0,
    tasks: [],
    recentTools: [],
    watchdog: {
      isNormal: true,
      loopDetected: false,
      stallDetected: false,
      loopConfidence: 0,
      lastHeartbeat: nowMs(),
    },
  };
}
