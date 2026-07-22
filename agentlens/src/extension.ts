import * as vscode from 'vscode';
import * as fs from 'fs';
import * as readline from 'readline';
import { findLatestSessionFile, getProjectNameFromPath } from './watcher/logFinder';
import { TailStream } from './watcher/tailStream';
import { parseJsonlLine, toolEventToLog, extractTasksFromToolEvent } from './parser/jsonlParser';
import { buildTaskTree } from './parser/taskExtractor';
import { StateStore } from './state/stateStore';
import { SidebarProvider } from './views/sidebarProvider';
import { createStallTimer } from './watchdog/stallWatchdog';
import type { ToolCallEvent } from './common/types';

let stateStore: StateStore;
let tailStream: TailStream | null = null;
let stallTimer: ReturnType<typeof createStallTimer> | null = null;

export function activate(context: vscode.ExtensionContext) {
  stateStore = new StateStore();

  const sidebarProvider = new SidebarProvider(context.extensionUri, stateStore);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebarProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentlens.refresh', () => {
      startWatching();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentlens.clearHistory', () => {
      stateStore.reset('');
    }),
  );

  stallTimer = createStallTimer(() => {
    stateStore.updateHeartbeat();
  });
  stallTimer.start();

  startWatching();
  vscode.window.showInformationMessage('AgentLens activated — monitoring for Claude Code sessions.');
}

function startWatching(): void {
  if (tailStream) {
    tailStream.stop();
  }

  const sessionPath = findLatestSessionFile();
  if (!sessionPath) {
    vscode.window.showWarningMessage(
      'AgentLens: No Claude Code session found. Start a Claude Code session first.',
    );
    return;
  }

  const projectName = getProjectNameFromPath(sessionPath);
  stateStore.reset(projectName);

  replayExistingFile(sessionPath);

  tailStream = new TailStream(sessionPath);

  tailStream.on('line', (line: string) => {
    processLine(line);
  });

  tailStream.on('error', (err: Error) => {
    console.error(`AgentLens: ${err.message}`);
  });

  tailStream.start();
}

function replayExistingFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  rl.on('line', (line: string) => {
    processLine(line);
  });

  rl.on('close', () => {
    console.log('AgentLens: file replay complete');
  });

  rl.on('error', (err: Error) => {
    console.error(`AgentLens replay error: ${err.message}`);
  });
}

function processLine(line: string): void {
  const event = parseJsonlLine(line);
  if (!event) return;

  // Update sessionId from real data (prefer actual UUID over directory hash)
  if (event.sessionId && event.sessionId.length > 8) {
    const current = stateStore.getState();
    if (current.sessionId !== event.sessionId) {
      stateStore.setSessionId(event.sessionId);
    }
  }

  stateStore.updateHeartbeat();

  if (event.type === 'tool_start') {
    const toolEvent = event.data as ToolCallEvent;
    const log = toolEventToLog(toolEvent);
    stateStore.setActiveTool(log);

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
  if (tailStream) {
    tailStream.stop();
  }
  if (stallTimer) {
    stallTimer.stop();
  }
}
