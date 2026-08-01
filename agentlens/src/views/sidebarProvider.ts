import * as vscode from 'vscode';
import { StateStore } from '../state/stateStore';
import type { AgentSessionState } from '../common/types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'agentlens.sidebar';
  private view?: vscode.WebviewView;
  private store: StateStore;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly extensionUri: vscode.Uri, store: StateStore) {
    this.store = store;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    const sendState = () => {
      const state = this.store.getState();
      this.postMessage({ type: 'state_update', payload: state });
    };

    this.unsubscribe = this.store.subscribe(() => sendState());

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === 'ready') {
        sendState();
      }
      if (message.command === 'openFile' && message.filePath) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const uri = vscode.Uri.joinPath(workspaceFolder.uri, message.filePath);
          vscode.window.showTextDocument(uri, { preview: true });
        }
      }
      if (message.command === 'reset') {
        vscode.commands.executeCommand('agentlens.reset');
      }
    });

    sendState();
  }

  private postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const mainJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css'),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
  <title>AgentLens</title>
</head>
<body>
  <div id="root"></div>
  <script src="${mainJsUri}"></script>
</body>
</html>`;
  }
}
