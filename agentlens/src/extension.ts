import * as vscode from 'vscode';
import * as fs from 'fs';
import * as readline from 'readline';
import { findLatestSessionFile, getProjectNameFromPath, listAllSessionFiles } from './watcher/logFinder';
import { TailStream } from './watcher/tailStream';
import { parseJsonlLine, toolEventToLog, extractTasksFromToolEvent } from './parser/jsonlParser';
import { buildTaskTree } from './parser/taskExtractor';
import { FileGraph } from './parser/fileGraph';
import { StateStore } from './state/stateStore';
import { SidebarProvider } from './views/sidebarProvider';
import { createStallTimer } from './watchdog/stallWatchdog';
import type { ToolCallEvent, SessionInfo } from './common/types';
import * as path from 'path';
import * as os from 'os';
import { CLAUDE_PROJECTS_DIR } from './common/constants';

let stateStore: StateStore;
let tailStream: TailStream | null = null;
let stallTimer: ReturnType<typeof createStallTimer> | null = null;
let fileGraph = new FileGraph();
let outputChannel: vscode.OutputChannel;
let lastWatchdogAlert = { stall: false, loop: false };

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

  stateStore.subscribe((change) => {
    if (change.type === 'watchdog_changed') {
      const w = stateStore.getState().watchdog;
      if (w.loopDetected && !lastWatchdogAlert.loop) {
        lastWatchdogAlert.loop = true;
        vscode.window.showWarningMessage(`AgentLens: ${w.warningMessage || 'Loop detected!'}`, 'Dismiss');
      }
      if (w.stallDetected && !lastWatchdogAlert.stall) {
        lastWatchdogAlert.stall = true;
        vscode.window.showWarningMessage(`AgentLens: ${w.warningMessage || 'Agent stalled!'}`, 'Dismiss');
      }
      if (!w.loopDetected) lastWatchdogAlert.loop = false;
      if (!w.stallDetected) lastWatchdogAlert.stall = false;
    }

    if (change.type === 'tokens_updated') {
      const tokens = stateStore.getState().tokens;
      const totalTokens = tokens.inputTokens + tokens.outputTokens;
      if (totalTokens > 0 && totalTokens % 50_000 < 5000) {
        outputChannel.appendLine(`[Tokens] ${totalTokens.toLocaleString()} total | input: ${tokens.inputTokens.toLocaleString()} | output: ${tokens.outputTokens.toLocaleString()} | cache: ${tokens.cacheReadTokens.toLocaleString()}`);
      }
    }
  });

  stallTimer = createStallTimer(() => {
    stateStore.updateHeartbeat();
  });
  stallTimer.start();

  refreshSessionList();
  startWatching();

  vscode.window.showInformationMessage('AgentLens activated — monitoring for Claude Code sessions.');
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
  const firstLine = head.split('\n')[0];
  try {
    const d = JSON.parse(firstLine);
    return d.cwd || null;
  } catch {
    return null;
  }
}

function switchToSession(sessionPath: string): void {
  if (tailStream) tailStream.stop();
  fileGraph.reset();
  stateStore.reset(getProjectNameFromPath(sessionPath));
  stateStore.setCurrentSessionPath(sessionPath);

  replayExistingFile(sessionPath);

  tailStream = new TailStream(sessionPath);
  tailStream.on('line', (line: string) => processLine(line));
  tailStream.on('error', (err: Error) => outputChannel.appendLine(`[Error] ${err.message}`));
  tailStream.start();

  outputChannel.appendLine(`[Session] Switched to ${sessionPath}`);
}

function startWatching(): void {
  if (tailStream) tailStream.stop();

  const sessionPath = findLatestSessionFile();
  if (!sessionPath) {
    vscode.window.showWarningMessage('AgentLens: No Claude Code session found.');
    return;
  }

  fileGraph.reset();
  stateStore.reset(getProjectNameFromPath(sessionPath));
  stateStore.setCurrentSessionPath(sessionPath);
  refreshSessionList();

  replayExistingFile(sessionPath);

  tailStream = new TailStream(sessionPath);
  tailStream.on('line', (line: string) => processLine(line));
  tailStream.on('error', (err: Error) => outputChannel.appendLine(`[Error] ${err.message}`));
  tailStream.start();
}

function replayExistingFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  rl.on('line', (line: string) => processLine(line));
  rl.on('close', () => outputChannel.appendLine('[Replay] File replay complete'));
  rl.on('error', (err: Error) => outputChannel.appendLine(`[Replay Error] ${err.message}`));
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

  stateStore.updateHeartbeat();

  if (result.tokens) stateStore.addTokens(result.tokens);

  if (event.type === 'tool_start') {
    const toolEvent = event.data as ToolCallEvent;
    const log = toolEventToLog(toolEvent);
    stateStore.setActiveTool(log);

    // File graph: track edits and reads
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
  if (stallTimer) stallTimer.stop();
}
