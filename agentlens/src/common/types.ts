export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type SessionStatus = 'no_session' | 'working' | 'done' | 'interrupted' | 'waiting';

export interface SubTask {
  id: string;
  title: string;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  relatedFiles?: string[];
}

export interface ToolCallLog {
  id: string;
  toolName: string;
  summary: string;
  filePath?: string;
  command?: string;
  timestamp: number;
  status: 'running' | 'success' | 'error';
}

export interface ToolCallEvent {
  type: 'tool_start' | 'tool_end';
  id: string;
  toolName: string;
  summary: string;
  filePath?: string;
  command?: string;
  timestamp: number;
  raw: Record<string, unknown>;
}

export interface AgentEvent {
  type: 'tool_start' | 'tool_end' | 'todo_update' | 'heartbeat' | 'session_start' | 'session_end';
  sessionId: string;
  timestamp: number;
  data: ToolCallEvent | Record<string, unknown>;
}

export interface WatchdogStatus {
  isNormal: boolean;
  loopDetected: boolean;
  stallDetected: boolean;
  loopConfidence: number;
  lastHeartbeat: number;
  warningMessage?: string;
}

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  timeline: TokenSnapshot[];
}

export interface TokenSnapshot {
  ts: number;
  input: number;
  output: number;
  cacheRead: number;
}

export interface FileNode {
  path: string;
  editCount: number;
  lastEditedAt: number;
  relatedFiles: string[];
}

export interface SessionInfo {
  path: string;
  projectHash: string;
  sessionId: string;
  mtime: number;
  label: string;
}

export interface SessionHealth {
  loopCount: number;
  stallCount: number;
  toolCallCount: number;
  startTime: number;
  lastToolTime: number;
}

export interface AgentSessionState {
  sessionId: string;
  projectName: string;
  startTime: number;
  lastUpdatedTime: number;
  currentTaskIndex: number;
  tasks: SubTask[];
  activeToolCall?: ToolCallLog;
  recentTools: ToolCallLog[];
  watchdog: WatchdogStatus;
  tokens: TokenStats;
  files: FileNode[];
  availableSessions: SessionInfo[];
  currentSessionPath: string;
  sessionStatus: SessionStatus;
  lastTodoWriteAt: number;
  health: SessionHealth;
}

export interface StateChange {
  type: 'tasks_updated' | 'tool_started' | 'tool_ended' | 'heartbeat' | 'watchdog_changed' | 'session_reset' | 'tokens_updated' | 'files_updated' | 'sessions_list' | 'status_changed' | 'health_updated';
  partial: Partial<AgentSessionState>;
}
