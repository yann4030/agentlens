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
import type { ToolCallEvent, SessionInfo, AgentSessionState } from './common/types';

let stateStore: StateStore;
let tailStream: TailStream | null = null;
let fileGraph = new FileGraph();
let outputChannel: vscode.OutputChannel;
let retryTimer: NodeJS.Timeout | null = null; // polls for new sessions when none active

// ─── Thresholds (from VS Code settings) ──────────────

function cfg() {
  const c = vscode.workspace.getConfiguration('agentlens');
  return {
    pollMs: c.get<number>('pollIntervalMs', 5_000),
    idleTimeout: c.get<number>('idleTimeoutSeconds', 60) * 1000,
    activeToolTimeout: c.get<number>('activeToolTimeoutSeconds', 120) * 1000,
    staleFileTimeout: c.get<number>('staleFileTimeoutSeconds', 300) * 1000,
    staleTodoWrite: c.get<number>('staleTodoWriteSeconds', 120) * 1000,
    watchdogNotifications: c.get<boolean>('watchdogNotificationsEnabled', true),
    loopDetection: c.get<boolean>('loopDetectionEnabled', true),
    retryScanMs: c.get<number>('retryScanIntervalMs', 10_000),
  };
}

// ─── Activation ──────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  stateStore = new StateStore();
  outputChannel = vscode.window.createOutputChannel('AgentLens');

  const sidebarProvider = new SidebarProvider(context.extensionUri, stateStore);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebarProvider),
  );

  context.subscriptions.push(vscode.commands.registerCommand('agentlens.refresh', () => startWatching()));
  context.subscriptions.push(vscode.commands.registerCommand('agentlens.clearHistory', () => {
    fileGraph.reset();
    stateStore.reset('');
  }));
  context.subscriptions.push(vscode.commands.registerCommand('agentlens.reset', () => {
    outputChannel.appendLine('[Reset] Full reset triggered');
    stopTail();
    fileGraph.reset();
    stateStore.reset('');
    outputChannel.appendLine('[Reset] State cleared — restarting watch');
    startWatching();
    vscode.window.showInformationMessage('AgentLens: Full reset complete');
  }));
  context.subscriptions.push(vscode.commands.registerCommand('agentlens.switchSession', async () => {
    const allFiles = listAllSessionFiles();
    if (allFiles.length === 0) {
      vscode.window.showInformationMessage('No Claude Code sessions found.');
      return;
    }
    const sessions = buildSessionList(allFiles);
    const items = sessions.map((s) => ({
      label: s.label, description: s.sessionId.slice(0, 8) + '...', detail: s.path,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a session' });
    if (picked) switchToSession(picked.detail);
  }));
  context.subscriptions.push(outputChannel);

  // Workspace folder changes → re-scan
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => startWatching()),
  );

  // Watchdog notification debounce
  let lastLoopAlert = 0;
  let lastStallAlert = 0;
  stateStore.subscribe((change) => {
    if (change.type === 'watchdog_changed') {
      const w = stateStore.getState().watchdog;
      const now = Date.now();
      if (cfg().watchdogNotifications) {
        if (w.loopDetected && now - lastLoopAlert > 60_000) {
          lastLoopAlert = now;
          stateStore.bumpHealth('loop');
          vscode.window.showWarningMessage(`AgentLens: Loop detected — ${w.warningMessage || 'check the agent'}`, 'Dismiss');
        }
        if (w.stallDetected && now - lastStallAlert > 60_000) {
          lastStallAlert = now;
          stateStore.bumpHealth('stall');
          vscode.window.showWarningMessage(`AgentLens: Agent stalled — ${w.warningMessage || 'no recent output'}`, 'Dismiss');
        }
      }
      return;
    }
  });

  startWatching();
  refreshSessionList();
  vscode.window.showInformationMessage('AgentLens activated');
}

// ─── Session lifecycle ───────────────────────────────

function startWatching(): void {
  stopTail();
  clearRetry();

  const sessionPath = findSessionForWorkspace();
  if (!sessionPath) {
    stateStore.reset('');
    stateStore.setSessionStatus('no_session');
    outputChannel.appendLine('[Retry] No session found — will retry scan every ' + cfg().retryScanMs + 'ms');
    scheduleRetry();
    return;
  }

  outputChannel.appendLine(`[Start] ${sessionPath}`);
  stateStore.setCurrentSessionPath(sessionPath);
  refreshSessionList();

  replayFileSync(sessionPath);

  const state = stateStore.getState();
  const fileAge = getFileAge(sessionPath);
  const todoAge = state.lastTodoWriteAt ? Date.now() - state.lastTodoWriteAt : 0;
  const t = cfg();

  if (fileAge > t.staleFileTimeout) {
    stateStore.setSessionStatus('done');
    if (state.activeToolCall) stateStore.clearActiveTool();
    if (hasRunningTasks(state)) setAllTasksDone();
  } else if (state.tasks.length > 0 && todoAge > t.staleTodoWrite) {
    stateStore.clearTasks();
    stateStore.setSessionStatus('working');
  } else {
    stateStore.setSessionStatus('working');
  }

  startTail(sessionPath);
  startTailActivityCheck(sessionPath);
}

// ─── Workspace matching ──────────────────────────────

function findSessionForWorkspace(): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceCwd = workspaceFolder?.uri.fsPath;
  if (!workspaceCwd) return findLatestSessionFile();

  const normalizedWorkspace = normalizePath(workspaceCwd);

  // Find ALL sessions matching this workspace, return the most recently modified
  let best: string | null = null;
  let bestMtime = 0;

  for (const f of listAllSessionFiles()) {
    const cwd = extractCwdFromSession(f);
    if (cwd && normalizePath(cwd) === normalizedWorkspace) {
      try {
        const mtime = fs.statSync(f).mtimeMs;
        if (mtime > bestMtime) {
          bestMtime = mtime;
          best = f;
        }
      } catch { /* skip */ }
    }
  }

  if (best) {
    outputChannel.appendLine(`[Match] Workspace PICKED NEWEST: ${best}`);
    return best;
  }

  outputChannel.appendLine(`[Match] No workspace match, falling back to latest`);
  return findLatestSessionFile();
}

// ─── I/O ─────────────────────────────────────────────

function stopTail(): void {
  if (tailStream) { tailStream.stop(); tailStream = null; }
  if (tailActivityTimer) { clearInterval(tailActivityTimer); tailActivityTimer = null; }
  clearRetry();
}

function clearRetry(): void {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
}

function scheduleRetry(): void {
  clearRetry();
  retryTimer = setInterval(() => {
    const sp = findSessionForWorkspace();
    if (sp) {
      outputChannel.appendLine('[Retry] Session appeared — starting watch');
      startWatching();
    }
  }, cfg().retryScanMs);
}

function startTail(sp: string): void {
  tailStream = new TailStream(sp);
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

// ─── Event pipeline ──────────────────────────────────

function processLine(line: string): void {
  const result = parseJsonlLine(line);
  if (!result.event) {
    if (result.tokens) stateStore.addTokens(result.tokens);
    return;
  }

  const event = result.event;
  stateStore.setHeartbeat(event.timestamp);
  stateStore.setSessionStatus('working');

  if (result.tokens) stateStore.addTokens(result.tokens);

  if (event.type === 'tool_start') {
    stateStore.bumpHealth('tool');
    const te = event.data as ToolCallEvent;
    const log = toolEventToLog(te);
    stateStore.setActiveTool(log);

    if (te.filePath) {
      if (['Write', 'Edit'].includes(te.toolName)) {
        fileGraph.recordEdit(te.filePath);
        stateStore.setFiles(fileGraph.getAllFiles());
      } else if (te.toolName === 'Read') {
        fileGraph.recordRead(te.filePath);
        stateStore.setFiles(fileGraph.getAllFiles());
      }
    }

    const tasks = extractTasksFromToolEvent(te);
    if (tasks) {
      outputChannel.appendLine(`[TodoWrite] ${tasks.length} tasks parsed: ${tasks.map(t => `"${t.title}"(${t.status})`).join(', ')}`);
      const cs = stateStore.getState();
      const result = buildTaskTree(tasks, cs.tasks);
      stateStore.setTasks(result.tasks, result.currentTaskIndex);
    }
  }

  if (event.type === 'tool_end') {
    const te = event.data as ToolCallEvent;
    stateStore.completeActiveTool(toolEventToLog(te));
  }

  if (event.type === 'session_start') {
    const data = event.data as Record<string, unknown>;
    if (data.model) stateStore.setModel(data.model as string);
  }
}

// ─── Activity monitor ────────────────────────────────

let tailActivityTimer: NodeJS.Timeout | null = null;

function startTailActivityCheck(sp: string): void {
  if (tailActivityTimer) clearInterval(tailActivityTimer);
  tailActivityTimer = setInterval(() => {
    const t = cfg();
    const age = getFileAge(sp);
    const s = stateStore.getState();

    // File disappeared → rescan for a new session
    if (!fs.existsSync(sp)) {
      outputChannel.appendLine('[Activity] Session file gone — rescanning');
      startWatching();
      return;
    }

    // File is fresh → definitely working
    if (age < t.pollMs) {
      stateStore.setSessionStatus('working');

      const todoAge = s.lastTodoWriteAt ? Date.now() - s.lastTodoWriteAt : 0;
      if (s.tasks.length > 0 && todoAge > t.staleTodoWrite) {
        outputChannel.appendLine('[AutoClear] New session detected — clearing old tasks');
        stateStore.clearTasks();
      }

      return;
    }

    // Session completely stale → rescan for new sessions instead of just marking done
    if (age > t.staleFileTimeout * 3) {
      outputChannel.appendLine('[Activity] Session very stale — rescanning for new sessions');
      startWatching();
      return;
    }

    if (hasRunningTasks(s)) { stateStore.setSessionStatus('working'); return; }
    if (age > t.idleTimeout && !s.activeToolCall) { stateStore.setSessionStatus('done'); return; }
    if (age > t.activeToolTimeout && s.activeToolCall) { stateStore.setSessionStatus('interrupted'); return; }

    stateStore.setSessionStatus('working');
  }, cfg().pollMs);
}

// ─── Helpers ─────────────────────────────────────────

function hasRunningTasks(s: Readonly<AgentSessionState>): boolean {
  return s.tasks.some((t) => t.status === 'in_progress' || t.status === 'pending');
}

function setAllTasksDone(): void {
  const s = stateStore.getState();
  const cleaned = s.tasks.map((t) =>
    t.status === 'completed' || t.status === 'failed' ? t : { ...t, status: 'completed' as const, completedAt: Date.now() },
  );
  stateStore.setTasks(cleaned, cleaned.length);
}

function switchToSession(sp: string): void {
  stopTail();
  fileGraph.reset();
  stateStore.reset(getProjectNameFromPath(sp));
  stateStore.setCurrentSessionPath(sp);
  replayFileSync(sp);
  startTail(sp);
  outputChannel.appendLine(`[Session] ${sp}`);
}

function extractCwdFromSession(fp: string): string | null {
  if (!fs.existsSync(fp)) return null;
  const content = fs.readFileSync(fp, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    try { const d = JSON.parse(lines[i]); if (d.cwd) return d.cwd; } catch { /* skip */ }
  }
  return null;
}

function getFileAge(fp: string): number {
  try { return Date.now() - fs.statSync(fp).mtimeMs; } catch { return Infinity; }
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

export function deactivate(): void {
  stopTail();
}
