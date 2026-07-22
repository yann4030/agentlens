import type { AgentSessionState, ToolCallLog, SubTask, StateChange, FileNode, SessionInfo, SessionStatus } from '../common/types';
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

  setSessionId(id: string): void {
    this.state = { ...this.state, sessionId: id };
    this.emit('session_reset', { sessionId: id });
  }

  setSessionStatus(status: SessionStatus): void {
    this.state = { ...this.state, sessionStatus: status };
    this.emit('status_changed', { sessionStatus: status });
  }

  setHeartbeat(ts: number): void {
    this.state = {
      ...this.state,
      lastUpdatedTime: ts,
      watchdog: { ...this.state.watchdog, lastHeartbeat: ts },
    };
  }

  setActiveTool(tool: ToolCallLog): void {
    const tools = [...this.state.recentTools, tool].slice(-MAX_RECENT_TOOLS);
    this.state = {
      ...this.state,
      lastUpdatedTime: nowMs(),
      activeToolCall: { ...tool, status: 'running' },
      recentTools: tools,
      sessionStatus: 'working',
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
    const hasMatch = this.state.recentTools.some(
      (t) => t.id === result.id || (t.status === 'running' && t.toolName === 'unknown'),
    );
    const finalTools = hasMatch ? tools : [...tools, { ...result, status: 'success' as const }].slice(-MAX_RECENT_TOOLS);

    this.state = {
      ...this.state,
      lastUpdatedTime: nowMs(),
      activeToolCall: undefined,
      recentTools: finalTools,
    };
    this.reevaluateWatchdogAndEmit();
  }

  clearActiveTool(): void {
    if (!this.state.activeToolCall) return;
    const tools = this.state.recentTools.map((t) => {
      if (t.status === 'running') return { ...t, status: 'success' as const };
      return t;
    });
    this.state = {
      ...this.state,
      lastUpdatedTime: nowMs(),
      activeToolCall: undefined,
      recentTools: tools,
    };
    this.reevaluateWatchdogAndEmit();
  }

  clearTasks(): void {
    this.state = { ...this.state, tasks: [] };
    this.emit('tasks_updated', { tasks: [], currentTaskIndex: 0 });
  }

  setTasks(tasks: SubTask[], currentTaskIndex: number): void {
    const prevById = new Map(this.state.tasks.map((t) => [t.id, t]));
    const prevByTitle = new Map(this.state.tasks.map((t) => [t.title, t]));

    const merged = tasks.map((t) => {
      const prev = prevById.get(t.id) || prevByTitle.get(t.title);
      return {
        ...t,
        startedAt: t.status === 'in_progress'
          ? (prev?.startedAt || t.startedAt || nowMs())
          : (prev?.startedAt || t.startedAt),
        completedAt: t.status === 'completed'
          ? (prev?.completedAt || t.completedAt || nowMs())
          : (prev?.completedAt || t.completedAt),
      };
    });

    for (let i = currentTaskIndex - 1; i >= 0; i--) {
      if (merged[i] && merged[i].status !== 'completed' && merged[i].status !== 'failed') {
        merged[i] = { ...merged[i], status: 'completed' };
      }
    }

    this.state = { ...this.state, tasks: merged, currentTaskIndex, lastTodoWriteAt: nowMs() };
    this.emit('tasks_updated', { tasks: this.state.tasks, currentTaskIndex });
  }

  addTokens(t: { input: number; output: number; cacheRead: number; cacheCreation: number }): void {
    const MAX_TIMELINE = 100;
    const snap: import('../common/types').TokenSnapshot = {
      ts: nowMs(), input: t.input, output: t.output, cacheRead: t.cacheRead,
    };
    const timeline = [...this.state.tokens.timeline, snap].slice(-MAX_TIMELINE);
    this.state = {
      ...this.state,
      tokens: {
        inputTokens: this.state.tokens.inputTokens + t.input,
        outputTokens: this.state.tokens.outputTokens + t.output,
        cacheReadTokens: this.state.tokens.cacheReadTokens + t.cacheRead,
        cacheCreationTokens: this.state.tokens.cacheCreationTokens + t.cacheCreation,
        timeline,
      },
    };
    this.emit('tokens_updated', { tokens: this.state.tokens });
  }

  bumpHealth(kind: 'loop' | 'stall' | 'tool'): void {
    const h = this.state.health;
    this.state = {
      ...this.state,
      health: {
        ...h,
        loopCount: h.loopCount + (kind === 'loop' ? 1 : 0),
        stallCount: h.stallCount + (kind === 'stall' ? 1 : 0),
        toolCallCount: h.toolCallCount + (kind === 'tool' ? 1 : 0),
        lastToolTime: kind === 'tool' ? nowMs() : h.lastToolTime,
      },
    };
    this.emit('health_updated', { health: this.state.health });
  }

  setFiles(files: FileNode[]): void {
    this.state = { ...this.state, files };
    this.emit('files_updated', { files: this.state.files });
  }

  setSessions(sessions: SessionInfo[]): void {
    this.state = { ...this.state, availableSessions: sessions };
    this.emit('sessions_list', { availableSessions: sessions });
  }

  setCurrentSessionPath(p: string): void {
    this.state = { ...this.state, currentSessionPath: p };
  }

  reset(id: string): void {
    this.state = { ...makeInitialState(id), currentSessionPath: this.state.currentSessionPath, availableSessions: this.state.availableSessions };
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
    tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, timeline: [] },
    files: [],
    availableSessions: [],
    currentSessionPath: '',
    sessionStatus: 'no_session',
    lastTodoWriteAt: 0,
    health: { loopCount: 0, stallCount: 0, toolCallCount: 0, startTime: nowMs(), lastToolTime: 0 },
  };
}
