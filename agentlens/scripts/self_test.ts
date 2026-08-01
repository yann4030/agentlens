// Self-test script for AgentLens — pure-logic modules
// Run: npx tsx scripts/self_check.py
// Note: this is a ts file, self_check.py was the old Python version

import { estimateCost } from '../src/common/costCalculator';
import { generateSignature, formatDuration, clamp } from '../src/common/utils';
import { parseJsonlLine, extractTasksFromToolEvent } from '../src/parser/jsonlParser';
import { buildTaskTree } from '../src/parser/taskExtractor';
import { checkLoop } from '../src/watchdog/loopDetector';
import { checkStall } from '../src/watchdog/stallWatchdog';
import type { ToolCallLog, ToolCallEvent } from '../src/common/types';

let passed = 0;
let failed = 0;

function assert(label: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`  FAIL [${label}]: ${(e as Error).message}`);
  }
}

function eq<T>(actual: T, expected: T, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function ok(val: unknown, msg = ''): void {
  if (!val) throw new Error(msg || 'expected truthy');
}

console.log('=== AgentLens Self-Test ===\n');

// ─── Cost Calculator ───────────────────────────────

console.log('[1] costCalculator');

assert('sonnet-4-5 rates', () => {
  const c = estimateCost(1_000_000, 100_000, 0, 0, 'claude-sonnet-4-5');
  // input: 3.0/M + output: 15.0*0.1 = 1.5 → 4.5
  eq(c, 4.5);
});

assert('opus-4-8 rates', () => {
  const c = estimateCost(1_000_000, 0, 0, 0, 'claude-opus-4-8');
  eq(c, 15.0);
});

assert('haiku-4-5 rates', () => {
  const c = estimateCost(0, 1_000_000, 0, 0, 'claude-haiku-4-5');
  eq(c, 4.0);
});

assert('cache read cost', () => {
  const c = estimateCost(0, 0, 1_000_000, 0, 'claude-sonnet-4');
  eq(c, 0.30);
});

assert('cache write cost', () => {
  const c = estimateCost(0, 0, 0, 1_000_000, 'claude-sonnet-4');
  eq(c, 3.75);
});

assert('default rate on unknown model', () => {
  const c = estimateCost(1_000_000, 0, 0, 0);
  eq(c, 3.0);
});

assert('default rate when model null', () => {
  const c = estimateCost(1_000_000, 0, 0, 0, undefined);
  eq(c, 3.0);
});

assert('zero tokens = zero cost', () => {
  eq(estimateCost(0, 0, 0, 0, 'claude-opus-4'), 0);
});

assert('small numbers (4dp precision)', () => {
  // 100 input tokens at sonnet rates = 100/1M * 3.0 = 0.0003
  const c = estimateCost(100, 0, 0, 0, 'claude-sonnet-4');
  eq(c, 0.0003);
});

// ─── Utils ─────────────────────────────────────────

console.log('[2] utils');

assert('generateSignature basic', () => {
  const sig = generateSignature({ toolName: 'Write', filePath: 'src/a.ts', timestamp: 1, id: '1', status: 'running', summary: '' });
  eq(sig, 'Write:src/a.ts');
});

assert('generateSignature normalizes whitespace', () => {
  const sig = generateSignature({ toolName: 'Bash', command: 'ls  -la', timestamp: 1, id: '2', status: 'running', summary: '' });
  eq(sig, 'Bash:ls -la');
});

assert('formatDuration seconds', () => eq(formatDuration(5000), '5s'));
assert('formatDuration minutes', () => eq(formatDuration(125000), '2m 5s'));
assert('clamp in range', () => eq(clamp(5, 0, 10), 5));
assert('clamp below', () => eq(clamp(-1, 0, 10), 0));
assert('clamp above', () => eq(clamp(100, 0, 10), 10));

// ─── JSONL Parser ──────────────────────────────────

console.log('[3] jsonlParser');

assert('parse system record', () => {
  const line = JSON.stringify({ type: 'system', sessionId: 'abc', cwd: '/home/project', model: 'claude-sonnet-4' });
  const r = parseJsonlLine(line);
  ok(r.event !== null);
  eq(r.event!.type, 'session_start');
  eq((r.event!.data as any).cwd, '/home/project');
  eq((r.event!.data as any).model, 'claude-sonnet-4');
});

assert('parse assistant tool_use', () => {
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'abc',
    message: {
      content: [{ type: 'tool_use', name: 'Read', id: 'tool_1', input: { file_path: 'src/app.ts' } }],
      usage: { input_tokens: 500, output_tokens: 200 },
    },
  });
  const r = parseJsonlLine(line);
  ok(r.event !== null);
  eq(r.event!.type, 'tool_start');
  eq((r.event!.data as ToolCallEvent).toolName, 'Read');
  eq((r.event!.data as ToolCallEvent).filePath, 'src/app.ts');
  eq(r.tokens!.input, 500);
  eq(r.tokens!.output, 200);
});

assert('parse assistant thinking (heartbeat)', () => {
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'abc',
    message: { content: [{ type: 'thinking', thinking: 'hmm' }] },
  });
  const r = parseJsonlLine(line);
  eq(r.event!.type, 'heartbeat');
  eq(r.event!.data?.kind, 'thinking');
});

assert('parse user tool_result', () => {
  const line = JSON.stringify({
    type: 'user',
    sessionId: 'abc',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'file content here...' }],
    },
  });
  const r = parseJsonlLine(line);
  ok(r.event !== null);
  eq(r.event!.type, 'tool_end');
  eq((r.event!.data as ToolCallEvent).id, 'tool_1');
  eq((r.event!.data as ToolCallEvent).summary, 'file content here...');
});

assert('parse invalid JSON returns null', () => {
  const r = parseJsonlLine('not valid json {{{');
  eq(r.event, null);
});

assert('parse unknown type returns null', () => {
  const r = parseJsonlLine(JSON.stringify({ type: 'unknown', sessionId: 'abc', message: {} }));
  eq(r.event, null);
});

// ─── Task Extraction ───────────────────────────────

console.log('[4] extractTasksFromToolEvent');

assert('extract from TodoWrite', () => {
  const evt: ToolCallEvent = {
    type: 'tool_start',
    id: '1',
    toolName: 'TodoWrite',
    summary: 'todos',
    timestamp: 1000,
    raw: { input: { todos: [{ content: 'Fix bug', status: 'in_progress' }, { content: 'Add test', status: 'pending' }] } },
  };
  const tasks = extractTasksFromToolEvent(evt);
  ok(tasks !== null);
  eq(tasks!.length, 2);
  eq(tasks![0].title, 'Fix bug');
  eq(tasks![0].status, 'in_progress');
  eq(tasks![1].title, 'Add test');
  eq(tasks![1].status, 'pending');
});

assert('null for non-TodoWrite', () => {
  const evt: ToolCallEvent = { type: 'tool_start', id: '1', toolName: 'Read', summary: 'x', timestamp: 1000, raw: {} };
  eq(extractTasksFromToolEvent(evt), null);
});

// ─── Task Tree Builder ─────────────────────────────

console.log('[5] buildTaskTree');

assert('first TodoWrite', () => {
  const newTasks = [{ id: 'a', title: 'Task 1', status: 'in_progress' as const }, { id: 'b', title: 'Task 2', status: 'pending' as const }];
  const result = buildTaskTree(newTasks, []);
  eq(result.tasks.length, 2);
  eq(result.currentTaskIndex, 0);
  eq(result.tasks[0].status, 'in_progress');
});

assert('merge with existing preserves timestamps', () => {
  const existing = [{ id: 'a', title: 'Task 1', status: 'in_progress' as const, startedAt: 1000 }];
  const newTasks = [{ id: 'a', title: 'Task 1', status: 'completed' as const }];
  const result = buildTaskTree(newTasks, existing);
  eq(result.tasks[0].status, 'completed');
  ok(result.tasks[0].completedAt! >= 1000);
});

assert('auto-completes tasks before current', () => {
  const newTasks = [
    { id: 'a', title: 'Task 1', status: 'pending' as const },
    { id: 'b', title: 'Task 2', status: 'pending' as const },
    { id: 'c', title: 'Task 3', status: 'in_progress' as const },
  ];
  // buildTaskTree handles this, stateStore.setTasks handles the auto-complete
  const result = buildTaskTree(newTasks, []);
  eq(result.currentTaskIndex, 2);
});

// ─── Loop Detector ─────────────────────────────────

console.log('[6] loopDetector');

function makeTool(name: string, path: string): ToolCallLog {
  return { id: path, toolName: name, filePath: path, timestamp: Date.now(), status: 'success', summary: `${name}: ${path}` };
}

assert('no loop with empty window', () => {
  const r = checkLoop([]);
  eq(r.isLoop, false);
  eq(r.confidence, 0);
});

assert('no loop with varied tools', () => {
  const tools = [
    makeTool('Read', 'a.ts'), makeTool('Write', 'b.ts'), makeTool('Read', 'c.ts'),
    makeTool('Edit', 'd.ts'), makeTool('Bash', 'ls'),
  ];
  const r = checkLoop(tools);
  eq(r.isLoop, false);
});

assert('detects 4 identical calls', () => {
  const tools = [makeTool('Read', 'x.ts'), makeTool('Read', 'x.ts'), makeTool('Read', 'x.ts'), makeTool('Read', 'x.ts')];
  const r = checkLoop(tools);
  eq(r.isLoop, true);
  ok(r.confidence >= 0.9);
});

assert('detects alternating pattern', () => {
  const tools = [
    makeTool('Read', 'a.ts'), makeTool('Write', 'b.ts'),
    makeTool('Read', 'a.ts'), makeTool('Write', 'b.ts'),
    makeTool('Read', 'a.ts'), makeTool('Write', 'b.ts'),
  ];
  const r = checkLoop(tools);
  eq(r.isLoop, true);
  ok(r.confidence >= 0.8);
});

assert('high frequency but not loop', () => {
  const tools = [
    makeTool('Read', 'a.ts'), makeTool('Read', 'b.ts'), makeTool('Read', 'c.ts'),
    makeTool('Read', 'a.ts'), makeTool('Read', 'b.ts'),
  ];
  // 5 tools: a x2, b x2, c x1 → max is 2/5 = 0.4, below 0.6
  const r = checkLoop(tools);
  eq(r.isLoop, false);
});

// ─── Stall Watchdog ────────────────────────────────

console.log('[7] stallWatchdog');

assert('recent heartbeat is normal', () => {
  const r = checkStall(Date.now());
  eq(r.isStall, false);
  eq(r.severity, 'normal');
});

assert('45s ago is warning', () => {
  const r = checkStall(Date.now() - 50_000);
  eq(r.isStall, true);
  eq(r.severity, 'warning');
});

assert('120s ago is critical', () => {
  const r = checkStall(Date.now() - 130_000);
  eq(r.isStall, true);
  eq(r.severity, 'critical');
});

// ─── Summary ───────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
