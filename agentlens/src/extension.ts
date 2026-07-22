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
let lastWatchdogAlert = { stall: false, loop: false, toolRunning: false };
let stallCheckInterval: NodeJS.Timeout | null = null;

const STALL_CHECK_MS = 5000;
const STALL_WARN_ACTIVE_TOOL_MS = 120_000; // 2 min — tool running, be patient
const STALL_AUTO_CLEAR_ACTIVE_MS = 300_000; // 5 min — auto-clear orphan activeToolCall
const STALL_WARN_IDLE_MS = 60_000;           // 1 min — nothing happening at all

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
      const sessions = stateStore.getState().availableSessions;
      if (sessions.length === 0) {
        const allFiles = listAllSessionFiles();
        if (allFiles.length === 0) {
          vscode.window.showInformationMessage('No Claude Code sessions found.');
          return;
        }
        const items = allFiles.map((f) => ({
          label: path.basename(f, '.jsonl').slice(0, 8) + '...',
          description: path.basename(path.dirname(f)),
          detail: f,
        }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a session' });
        if (picked) switchToSession(picked.detail);
      } else {
        const items = sessions.map((s) => ({
          label: s.label,
          description: s.sessionId.slice(0, 8) + '...',
          detail: s.path,
        }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a session' });
        if (picked) switchToSession(picked.detail);
      }
    }),
  );

  context.subscriptions.push(outputChannel);

  // Stall checker: does NOT inject heartbeat. Only evaluates real data.
  stallCheckInterval = setInterval(() => {
    checkForStall();
  }, STALL_CHECK_MS);
  context.subscriptions.push({ dispose: () => { if (stallCheckInterval) clearInterval(stallCheckInterval); } });

  startWatching();
  refreshSessionList();

  vscode.window.showInformationMessage('AgentLens activated');
}

function checkForStall(): void {
  const state = stateStore.getState();
  const elapsed = Date.now() - state.watchdog.lastHeartbeat;
  const hasActiveTool = !!state.activeToolCall;

  // Auto-clear orphan activeToolCall when agent is clearly done
  if (hasActiveTool && elapsed > STALL_AUTO_CLEAR_ACTIVE_MS) {
    outputChannel.appendLine(`[Stall] Auto-clearing orphan activeTool "${state.activeToolCall!.summary}" after ${Math.floor(elapsed / 1000)}s`);
    stateStore.clearActiveTool();
  }

  if (hasActiveTool && elapsed > STALL_WARN_ACTIVE_TOOL_MS && !lastWatchdogAlert.toolRunning) {
    lastWatchdogAlert.toolRunning = true;
    const minutes = Math.floor(elapsed / 60000);
    vscode.window.showWarningMessage(
      `AgentLens: "${state.activeToolCall!.summary}" has been running for ${minutes}min.`,
      'Dismiss',
    );
  }

  if (!hasActiveTool && elapsed > STALL_WARN_IDLE_MS && !lastWatchdogAlert.stall) {
    lastWatchdogAlert.stall = true;
    vscode.window.showWarningMessage(
      `AgentLens: Agent idle for ${Math.floor(elapsed / 1000)}s.`,
      'Dismiss',
    );
  }

  if (elapsed < 5000) {
    if (lastWatchdogAlert.stall) lastWatchdogAlert.stall = false;
    if (lastWatchdogAlert.toolRunning) lastWatchdogAlert.toolRunning = false;
  }

  stateStore.evaluateStall(elapsed, hasActiveTool);
}

function refreshSessionList(): void {
  const sessionFiles = listAllSessionFiles();
  const sessions: SessionInfo[] = sessionFiles.map((f) => {
    const stat = fs.statSync(f);
    const parts = f.split(path.sep);
    const projectsIdx = parts.lastIndexOf('projects');
    const projectHash = projectsIdx >= 0 ? parts[projectsIdx + 1] : 'unknown';
    const sessionId = path.basename(f, '.jsonl');

    let label = projectHash;
    try {
      const cwd = extractCwdFromSession(f);
      if (cwd) label = path.basename(cwd);
    } catch { /* ignore */ }

    return {
      path: f,
      projectHash,
      sessionId,
      mtime: stat.mtime.getTime(),
      label,
    };
  }).filter((s) => s.mtime > Date.now() - 7 * 24 * 3600 * 1000);

  stateStore.setSessions(sessions);
}

function extractCwdFromSession(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const head = fs.readFileSync(filePath, { encoding: 'utf-8' });
  // CWD is often on line 2, not line 1. Scan first 10 lines.
  const lines = head.split('\n');
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    try {
      const d = JSON.parse(lines[i]);
      if (d.cwd) return d.cwd;
    } catch { /* skip */ }
  }
  return null;
}

/** Find the session file whose cwd matches the currently active VS Code workspace. */
function findSessionForWorkspace(): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceCwd = workspaceFolder?.uri.fsPath;
  if (!workspaceCwd) return null;

  const allFiles = listAllSessionFiles();
  for (const f of allFiles) {
    const cwd = extractCwdFromSession(f);
    if (cwd && normalizePath(cwd) === normalizePath(workspaceCwd)) {
      outputChannel.appendLine(`[Match] Workspace "${workspaceCwd}" → session "${f}"`);
      return f;
    }
  }

  // Fallback: return latest if no workspace match
  outputChannel.appendLine(`[Match] No workspace match for "${workspaceCwd}", falling back to latest`);
  return findLatestSessionFile();
}

function normalizePath(p: string): string {
  return path.normalize(p).replace(/\\/g, '/').toLowerCase();
}

function switchToSession(sessionPath: string): void {
  stopTail();
  fileGraph.reset();
  stateStore.reset(getProjectNameFromPath(sessionPath));
  stateStore.setCurrentSessionPath(sessionPath);

  replayFileSync(sessionPath);
  startTail(sessionPath);

  outputChannel.appendLine(`[Session] Switched to ${sessionPath}`);
}

function startWatching(): void {
  stopTail();

  // Match session to current VS Code workspace, not just latest globally
  const sessionPath = findSessionForWorkspace();
  if (!sessionPath) {
    vscode.window.showWarningMessage('AgentLens: No Claude Code session found for this workspace.');
    return;
  }

  outputChannel.appendLine(`[Start] Watching: ${sessionPath}`);

  fileGraph.reset();
  stateStore.reset(getProjectNameFromPath(sessionPath));
  stateStore.setCurrentSessionPath(sessionPath);
  refreshSessionList();

  replayFileSync(sessionPath);
  startTail(sessionPath);
}

function stopTail(): void {
  if (tailStream) {
    tailStream.stop();
    tailStream = null;
  }
}

function startTail(sessionPath: string): void {
  tailStream = new TailStream(sessionPath);
  tailStream.on('line', (line: string) => processLine(line));
  tailStream.on('error', (err: Error) => outputChannel.appendLine(`[Error] ${err.message}`));
  tailStream.start();
}

/** Read entire file synchronously, process every line, THEN return. No race with tail. */
function replayFileSync(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) processLine(trimmed);
  }

  const state = stateStore.getState();

  // Clear orphan activeToolCall from finished sessions
  if (state.activeToolCall) {
    outputChannel.appendLine(`[Replay] Clearing presumed-done activeTool: ${state.activeToolCall.summary}`);
    stateStore.clearActiveTool();
  }

  // If session looks stale (last heartbeat > 60s ago, no active tool),
  // mark all in_progress tasks as completed so old session state doesn't show as "running"
  const elapsed = Date.now() - state.watchdog.lastHeartbeat;
  if (elapsed > 60_000 && !state.activeToolCall && state.tasks.some((t) => t.status === 'in_progress')) {
    outputChannel.appendLine(`[Replay] Session ${Math.floor(elapsed / 1000)}s stale, auto-completing tasks`);
    const cleaned = state.tasks.map((t) =>
      t.status === 'in_progress' ? { ...t, status: 'completed' as const, completedAt: Date.now() } : t,
    );
    stateStore.setTasks(cleaned, cleaned.length);
  }

  outputChannel.appendLine(`[Replay] ${lines.length} lines processed`);
}

function processLine(line: string): void {
  const result = parseJsonlLine(line);
  if (!result.event) {
    if (result.tokens) stateStore.addTokens(result.tokens);
    return;
  }

  const event = result.event;

  if (event.sessionId && event.sessionId.length > 8) {
    const current = stateStore.getState();
    if (current.sessionId !== event.sessionId) {
      stateStore.setSessionId(event.sessionId);
    }
  }

  // Heartbeat from real data only
  stateStore.updateHeartbeat();

  if (result.tokens) stateStore.addTokens(result.tokens);

  if (event.type === 'tool_start') {
    const toolEvent = event.data as ToolCallEvent;
    const log = toolEventToLog(toolEvent);
    stateStore.setActiveTool(log);

    if (toolEvent.filePath) {
      const editTools = ['Write', 'Edit'];
      const readTools = ['Read'];
      if (editTools.includes(toolEvent.toolName)) {
        fileGraph.recordEdit(toolEvent.filePath);
        stateStore.setFiles(fileGraph.getAllFiles());
      } else if (readTools.includes(toolEvent.toolName)) {
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

export function deactivate(): void {
  if (tailStream) tailStream.stop();
  if (stallCheckInterval) clearInterval(stallCheckInterval);
}
