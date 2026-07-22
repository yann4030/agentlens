import React from 'react';
import type { FileNode } from '../../common/types';

interface Props {
  files: FileNode[];
}

export const FileTree: React.FC<Props> = ({ files }) => {
  if (files.length === 0) {
    return (
      <div className="empty-state">
        <p>No file activity yet.</p>
        <p className="hint">Files the agent reads or edits will appear here.</p>
      </div>
    );
  }

  return (
    <div className="file-list">
      {files.map((file) => (
        <div key={file.path} className="file-item">
          <span className={`file-dot file-dot-${file.editCount > 0 ? 'edited' : 'read'}`} />
          <span className="file-path" title={file.path}>
            {shortName(file.path)}
          </span>
          <span className="file-stats">
            {file.editCount > 0 && (
              <span className="file-edits">{file.editCount} edits</span>
            )}
            {file.relatedFiles.length > 0 && (
              <span className="file-relations" title={file.relatedFiles.join(', ')}>
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
  const parts = p.split('/');
  return parts.slice(-2).join('/');
}
