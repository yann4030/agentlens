import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findLatestSessionFile, getProjectNameFromPath, listAllSessionFiles } from './watcher/logFinder';
import { TailStream } from './watcher/tailStream';
import { parseJsonlLine, toolEventToLog, extractTasksFromToolEvent } from './parser/jsonlParser';
import { buildTaskTree } from './parser/taskExtractor';
import { FileGraph } from './parser/fileGraph';
import { StateStore } from './state/stateStore';
import { SidebarProvider } from './views/sidebarProvider';
import type { ToolCallEvent, SessionInfo } from './common/types';

let stateStore: StateStore;
let tailStream: TailStream | null = null;
let fileGraph = new FileGraph();
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  stateStore = new StateStore();
  outputChannel = vscode.window.createOutputChannel('AgentLens');

  const sidebarProvider = new SidebarProvider(context.extensionUri, stateStore);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebarProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentlens.refresh', () => startWatching()),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('agentlens.clearHistory', () => {
      fileGraph.reset();
      stateStore.reset('');
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('agentlens.switchSession', async () => {
      const allFiles = listAllSessionFiles();
      if (allFiles.length === 0) {
        vscode.window.showInformationMessage('No Claude Code sessions found.');
        return;
      }
      const sessions = buildSessionList(allFiles);
      const items = sessions.map((s) => ({ label: s.label, description: s.sessionId.slice(0, 8) + '...', detail: s.path }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a session' });
      if (picked) switchToSession(picked.detail);
    }),
  );
  context.subscriptions.push(outputChannel);

  startWatching();
  refreshSessionList();

  vscode.window.showInformationMessage('AgentLens activated');
}

// ─── Session matching ────────────────────────────────

function startWatching(): void {
  stopTail();

  const sessionPath = findSessionForWorkspace();
  if (!sessionPath) {
    stateStore.reset('');
    stateStore.setSessionStatus('no_session');
    return;
  }

  outputChannel.appendLine(`[Start] Watching: ${sessionPath}`);
  stateStore.setCurrentSessionPath(sessionPath);
  refreshSessionList();

  // Replay the entire file to capture current state
  replayFileSync(sessionPath);

  // After replay, determine session status
  const state = stateStore.getState();
  const fileAge = getFileAge(sessionPath);
  const heartbeatAge = Date.now() - state.watchdog.lastHeartbeat;

  if (fileAge < 30_000 || heartbeatAge < 30_000) {
    // File is active: session is RUNNING
    // Tasks are from latest TodoWrite — keep as-is (they're live)
    stateStore.setSessionStatus('working');
  } else {
    // File is stale: session FINISHED
    // Mark all non-completed tasks as done, clear active tool
    stateStore.setSessionStatus('done');
    if (state.activeToolCall) stateStore.clearActiveTool();
    const hasRunning = state.tasks.some((t) => t.status !== 'completed' && t.status !== 'failed');
    if (hasRunning) {
      const cleaned = state.tasks.map((t) =>
        t.status === 'completed' || t.status === 'failed' ? t : { ...t, status: 'completed' as const, completedAt: Date.now() },
      );
      stateStore.setTasks(cleaned, cleaned.length);
    }
  }

  startTail(sessionPath);
}

function findSessionForWorkspace(): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceCwd = workspaceFolder?.uri.fsPath;
  if (!workspaceCwd) return findLatestSessionFile();

  const allFiles = listAllSessionFiles();
  for (const f of allFiles) {
    const cwd = extractCwdFromSession(f);
    if (cwd && normalizePath(cwd) === normalizePath(workspaceCwd)) {
      return f;
    }
  }
  return findLatestSessionFile();
}

// ─── Tail / Replay ────────────────────────────────────

function stopTail(): void {
  if (tailStream) { tailStream.stop(); tailStream = null; }
}

function startTail(sessionPath: string): void {
  tailStream = new TailStream(sessionPath);
  tailStream.on('line', (line: string) => processLine(line));
  tailStream.on('error', (err: Error) => outputChannel.appendLine(`[Error] ${err.message}`));
  tailStream.start();
}

function replayFileSync(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) processLine(trimmed);
  }
  outputChannel.appendLine(`[Replay] ${lines.length} lines`);
}

// ─── Event processing ─────────────────────────────────

function processLine(line: string): void {
  const result = parseJsonlLine(line);
  if (!result.event) {
    if (result.tokens) stateStore.addTokens(result.tokens);
    return;
  }

  const event = result.event;

  // Heartbeat from event's own timestamp (not wall clock)
  stateStore.setHeartbeat(event.timestamp);

  if (result.tokens) stateStore.addTokens(result.tokens);

  if (event.type === 'tool_start') {
    const toolEvent = event.data as ToolCallEvent;
    const log = toolEventToLog(toolEvent);
    stateStore.setActiveTool(log);

    if (toolEvent.filePath) {
      if (['Write', 'Edit'].includes(toolEvent.toolName)) {
        fileGraph.recordEdit(toolEvent.filePath);
        stateStore.setFiles(fileGraph.getAllFiles());
      } else if (toolEvent.toolName === 'Read') {
        fileGraph.recordRead(toolEvent.filePath);
        stateStore.setFiles(fileGraph.getAllFiles());
      }
    }

    const tasks = extractTasksFromToolEvent(toolEvent);
    if (tasks) {
      const currentState = stateStore.getState();
      const result = buildTaskTree(tasks, currentState.tasks);
      stateStore.setTasks(result.tasks, result.currentTaskIndex);
    }
  }

  if (event.type === 'tool_end') {
    const toolEvent = event.data as ToolCallEvent;
    const log = toolEventToLog(toolEvent);
    stateStore.completeActiveTool(log);
  }
}

// ─── Helpers ──────────────────────────────────────────

function switchToSession(sessionPath: string): void {
  stopTail();
  fileGraph.reset();
  stateStore.reset(getProjectNameFromPath(sessionPath));
  stateStore.setCurrentSessionPath(sessionPath);
  replayFileSync(sessionPath);
  startTail(sessionPath);
  outputChannel.appendLine(`[Session] ${sessionPath}`);
}

function extractCwdFromSession(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    try {
      const d = JSON.parse(lines[i]);
      if (d.cwd) return d.cwd;
    } catch { /* skip */ }
  }
  return null;
}

function getFileAge(filePath: string): number {
  try { return Date.now() - fs.statSync(filePath).mtimeMs; } catch { return Infinity; }
}

function normalizePath(p: string): string {
  return path.normalize(p).replace(/\\/g, '/').toLowerCase();
}

function buildSessionList(files: string[]): SessionInfo[] {
  return files.map((f) => {
    try {
      const stat = fs.statSync(f);
      const parts = f.split(path.sep);
      const projectsIdx = parts.lastIndexOf('projects');
      const projectHash = projectsIdx >= 0 ? parts[projectsIdx + 1] : '?';
      const sessionId = path.basename(f, '.jsonl');
      let label = projectHash;
      const cwd = extractCwdFromSession(f);
      if (cwd) label = path.basename(cwd);
      return { path: f, projectHash, sessionId, mtime: stat.mtime.getTime(), label };
    } catch {
      return { path: f, projectHash: '?', sessionId: '?', mtime: 0, label: f };
    }
  }).filter((s) => s.mtime > Date.now() - 7 * 24 * 3600 * 1000);
}

function refreshSessionList(): void {
  stateStore.setSessions(buildSessionList(listAllSessionFiles()));
}

// ─── Cleanup ──────────────────────────────────────────

export function deactivate(): void {
  stopTail();
}
