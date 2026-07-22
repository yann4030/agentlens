import React from 'react';
import type { ToolCallLog } from '../../common/types';

interface Props {
  tools: ToolCallLog[];
  activeTool?: ToolCallLog;
}

export const ToolFeed: React.FC<Props> = ({ tools, activeTool }) => {
  const displayTools = [...tools].reverse().slice(0, 20);

  return (
    <div className="tool-feed">
      {activeTool && (
        <div className="tool-item tool-item-active">
          <span className="tool-indicator" />
          <span className="tool-name">{activeTool.toolName}</span>
          <span className="tool-summary">{activeTool.summary}</span>
        </div>
      )}
      {displayTools.map((tool) => (
        <div key={tool.id} className={`tool-item tool-${tool.status}`}>
          <span className={`tool-dot tool-dot-${tool.status}`} />
          <span className="tool-name">{tool.toolName}</span>
          <span className="tool-summary">{tool.summary}</span>
          <span className="tool-time">{formatTime(tool.timestamp)}</span>
        </div>
      ))}
      {tools.length === 0 && (
        <div className="empty-state">
          <p>No tool calls yet.</p>
          <p className="hint">Tool calls will appear as the agent works.</p>
        </div>
      )}
    </div>
  );
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
