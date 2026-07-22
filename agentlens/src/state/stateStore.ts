import type { AgentSessionState, ToolCallLog, SubTask, StateChange, FileNode, SessionInfo } from '../common/types';
import { nowMs } from '../common/utils';
import { LOOP_WINDOW_SIZE, MAX_RECENT_TOOLS } from '../common/constants';
import { checkLoop, shouldAlert } from '../watchdog/loopDetector';
import { buildWatchdogStatus } from '../watchdog/stallWatchdog';

type StateListener = (change: StateChange) => void;

const STALL_WARN_ACTIVE_TOOL_MS = 300_000; // 5 min
const STALL_WARN_IDLE_MS = 60_000;          // 1 min

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
    const now = nowMs();
    this.state = {
      ...this.state,
      lastUpdatedTime: now,
      watchdog: { ...this.state.watchdog, lastHeartbeat: now },
    };
    this.emit('heartbeat', { lastUpdatedTime: now });
  }

  setActiveTool(tool: ToolCallLog): void {
    const tools = [...this.state.recentTools, tool].slice(-MAX_RECENT_TOOLS);
    this.state = {
      ...this.state,
      lastUpdatedTime: nowMs(),
      activeToolCall: { ...tool, status: 'running' },
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

  /** Clear orphan activeToolCall when no matching tool_result arrives after timeout */
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

    for (let i = currentTaskIndex - 1; i >= 0; i--) {
      if (merged[i] && merged[i].status !== 'completed' && merged[i].status !== 'failed') {
        merged[i] = { ...merged[i], status: 'completed' };
      }
    }

    this.state = { ...this.state, tasks: merged, currentTaskIndex };
    this.emit('tasks_updated', { tasks: this.state.tasks, currentTaskIndex });
  }

  addTokens(t: { input: number; output: number; cacheRead: number; cacheCreation: number }): void {
    this.state = {
      ...this.state,
      tokens: {
        inputTokens: this.state.tokens.inputTokens + t.input,
        outputTokens: this.state.tokens.outputTokens + t.output,
        cacheReadTokens: this.state.tokens.cacheReadTokens + t.cacheRead,
        cacheCreationTokens: this.state.tokens.cacheCreationTokens + t.cacheCreation,
      },
    };
    this.emit('tokens_updated', { tokens: this.state.tokens });
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

  /** Called periodically from extension host to refresh stall state based on real elapsed time */
  evaluateStall(elapsedMs: number, hasActiveTool: boolean): void {
    const isStall = hasActiveTool
      ? elapsedMs > STALL_WARN_ACTIVE_TOOL_MS
      : elapsedMs > STALL_WARN_IDLE_MS;

    const message = hasActiveTool
      ? `Tool "${this.state.activeToolCall?.summary || 'unknown'}" running for ${Math.floor(elapsedMs / 1000)}s`
      : `Agent idle for ${Math.floor(elapsedMs / 1000)}s — no tool running`;

    this.state = {
      ...this.state,
      watchdog: {
        ...this.state.watchdog,
        stallDetected: isStall,
        isNormal: !isStall && !this.state.watchdog.loopDetected,
        warningMessage: isStall ? message : this.state.watchdog.warningMessage,
      },
    };

    if (isStall) {
      this.emit('watchdog_changed', { watchdog: this.state.watchdog });
    }
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
    tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    files: [],
    availableSessions: [],
    currentSessionPath: '',
  };
}
