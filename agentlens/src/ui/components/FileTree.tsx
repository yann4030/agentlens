import React from 'react';
import type { FileNode } from '../../common/types';

interface Props {
  files: FileNode[];
  vscode: { postMessage(msg: unknown): void };
}

export const FileTree: React.FC<Props> = ({ files, vscode }) => {
  if (files.length === 0) {
    return (
      <div className="empty-state">
        <p>No file activity yet.</p>
        <p className="hint">Files the agent reads or edits will appear here.</p>
      </div>
    );
  }

  const openFile = (rawPath: string) => {
    vscode.postMessage({ command: 'openFile', filePath: rawPath });
  };

  return (
    <div className="file-list">
      {files.map((file) => (
        <div key={file.path} className="file-item" onClick={() => openFile(file.rawPath)} title="Click to open">
          <span className={`file-dot file-dot-${file.editCount > 0 ? 'edited' : 'read'}`} />
          <span className="file-path">
            {shortName(file.rawPath)}
          </span>
          <span className="file-stats">
            {file.editCount > 0 && (
              <span className="file-edits">{file.editCount} edits</span>
            )}
            {file.relatedFiles.length > 0 && (
              <span className="file-relations" title={file.relatedFiles.map(getShortName).join(', ')}>
                +{file.relatedFiles.length}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

function shortName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}

function getShortName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}
