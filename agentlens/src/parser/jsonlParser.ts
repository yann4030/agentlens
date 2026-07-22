import type { AgentEvent, ToolCallEvent, ToolCallLog, SubTask } from '../common/types';
import { shortId, nowMs } from '../common/utils';

interface RawRecord {
  type?: string;
  sessionId?: string;
  session_id?: string;
  message?: Record<string, unknown>;
  timestamp?: string;
  cwd?: string;
  model?: string;
  uuid?: string;
  [key: string]: unknown;
}

type JsonlBlock = Record<string, unknown>;

export interface ParseResult {
  event: AgentEvent | null;
  tokens?: { input: number; output: number; cacheRead: number; cacheCreation: number };
}

export function parseJsonlLine(line: string): ParseResult {
  try {
    const raw: RawRecord = JSON.parse(line);
    const timestamp = nowMs();
    const sessionId = (raw.sessionId as string) || (raw.session_id as string) || '';
    const recordType = (raw.type as string) || '';

    let tokens: ParseResult['tokens'] | undefined;

    if (recordType === 'system') {
      return { event: makeEvent('session_start', sessionId, timestamp, { cwd: raw.cwd, model: raw.model }), tokens };
    }

    if (recordType === 'assistant') {
      const result = parseAssistant(raw, sessionId, timestamp);
      tokens = result.tokens;
      return { event: result.event, tokens };
    }

    if (recordType === 'user') {
      return { event: parseUser(raw, sessionId, timestamp), tokens };
    }

    return { event: null, tokens };
  } catch {
    return { event: null, tokens: undefined };
  }
}

function extractTokens(msg: Record<string, unknown>): ParseResult['tokens'] {
  const usage = msg.usage as Record<string, number> | undefined;
  if (!usage) return undefined;
  return {
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
    cacheCreation: usage.cache_creation_input_tokens || 0,
  };
}

function parseAssistant(raw: RawRecord, sessionId: string, timestamp: number): { event: AgentEvent | null; tokens?: ParseResult['tokens'] } {
  const msg = raw.message;
  if (!msg || typeof msg !== 'object') return { event: null };

  const content = msg.content;
  const tokens = extractTokens(msg);

  if (!Array.isArray(content)) return { event: null, tokens };

  for (const block of content) {
    if (!isBlock(block)) continue;
    if (block.type === 'tool_use') {
      return { event: makeEvent('tool_start', sessionId, timestamp, buildToolCallEvent(block, 'tool_start', timestamp)), tokens };
    }
  }

  const hasThinking = content.some((b) => isBlock(b) && b.type === 'thinking');
  if (hasThinking) {
    return { event: makeEvent('heartbeat', sessionId, timestamp, { kind: 'thinking' }), tokens };
  }

  return { event: null, tokens };
}

function parseUser(raw: RawRecord, sessionId: string, timestamp: number): AgentEvent | null {
  const msg = raw.message;
  if (!msg || typeof msg !== 'object') {
    return makeEvent('heartbeat', sessionId, timestamp, {});
  }

  const content = msg.content;
  if (!Array.isArray(content)) return makeEvent('heartbeat', sessionId, timestamp, {});

  for (const block of content) {
    if (!isBlock(block)) continue;

    if (block.type === 'tool_result') {
      const evt = buildToolCallEvent(block, 'tool_end', timestamp);
      evt.id = (block.tool_use_id as string) || shortId();
      evt.summary = typeof block.content === 'string' ? block.content.slice(0, 100) : '';
      return makeEvent('tool_end', sessionId, timestamp, evt);
    }
  }

  return makeEvent('heartbeat', sessionId, timestamp, {});
}

// --- helpers ---

function isBlock(b: unknown): b is JsonlBlock {
  return typeof b === 'object' && b !== null;
}

function buildToolCallEvent(block: JsonlBlock, type: 'tool_start' | 'tool_end', timestamp: number): ToolCallEvent {
  const name = (block.name as string) || 'unknown';
  const input = block.input as Record<string, unknown> | undefined;

  return {
    type,
    id: (block.id as string) || shortId(),
    toolName: name,
    summary: buildSummary(name, input),
    filePath: extractPath(input),
    command: input ? (input.command as string) || undefined : undefined,
    timestamp,
    raw: block,
  };
}

function extractPath(input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  return (input.file_path as string) || (input.path as string) || undefined;
}

function buildSummary(name: string, input?: Record<string, unknown>): string {
  if (!input) return name;

  if (input.file_path || input.path) return `${name}: ${input.file_path || input.path}`;
  if (input.command) return `${name}: ${input.command}`;
  if (input.pattern) return `${name}: ${input.pattern}`;
  if (input.description) return `${name}: ${input.description}`;
  if (name === 'TodoWrite' && Array.isArray(input.todos)) {
    const todos = input.todos as Array<{ content: string }>;
    if (todos.length > 0) return `TodoWrite: ${todos.map((t) => t.content).join('; ')}`;
  }

  return name;
}

function makeEvent(type: AgentEvent['type'], sessionId: string, timestamp: number, data: unknown): AgentEvent {
  return { type, sessionId, timestamp, data } as AgentEvent;
}

// --- public helpers ---

export function toolEventToLog(event: ToolCallEvent): ToolCallLog {
  return {
    id: event.id,
    toolName: event.toolName,
    summary: event.summary,
    filePath: event.filePath,
    command: event.command,
    timestamp: event.timestamp,
    status: event.type === 'tool_start' ? 'running' : 'success',
  };
}

export function extractTasksFromToolEvent(event: ToolCallEvent): SubTask[] | null {
  if (event.toolName !== 'TodoWrite') return null;

  try {
    const input = event.raw.input as Record<string, unknown> | undefined;
    if (input?.todos && Array.isArray(input.todos)) {
      return (input.todos as Array<{ id?: string; content: string; status: string }>).map((t) => ({
        id: t.id || shortId(),
        title: t.content || 'unnamed task',
        status: mapStatus(t.status),
        startedAt: event.timestamp,
      }));
    }
    return null;
  } catch {
    return null;
  }
}

function mapStatus(s: string): SubTask['status'] {
  switch (s) {
    case 'in_progress': return 'in_progress';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    default: return 'pending';
  }
}
