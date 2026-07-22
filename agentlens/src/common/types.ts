export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

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

export interface TodoUpdateEvent {
  type: 'todo_update';
  tasks: SubTask[];
  timestamp: number;
}

export interface AgentEvent {
  type: 'tool_start' | 'tool_end' | 'todo_update' | 'heartbeat' | 'session_start' | 'session_end';
  sessionId: string;
  timestamp: number;
  data: ToolCallEvent | TodoUpdateEvent | Record<string, unknown>;
}

export interface WatchdogStatus {
  isNormal: boolean;
  loopDetected: boolean;
  stallDetected: boolean;
  loopConfidence: number;
  lastHeartbeat: number;
  warningMessage?: string;
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
}

export interface StateChange {
  type: 'tasks_updated' | 'tool_started' | 'tool_ended' | 'heartbeat' | 'watchdog_changed' | 'session_reset';
  partial: Partial<AgentSessionState>;
}
