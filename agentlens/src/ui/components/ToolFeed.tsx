import React, { useState, useEffect, useRef } from 'react';
import type { ToolCallLog } from '../../common/types';

interface Props {
  tools: ToolCallLog[];
  activeTool?: ToolCallLog;
}

export const ToolFeed: React.FC<Props> = ({ tools, activeTool }) => {
  const [, setTick] = useState(0);
  const displayTools = [...tools].reverse().slice(0, 20);

  // Force re-render every second to update elapsed timer
  useEffect(() => {
    if (!activeTool) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeTool?.id]);

  return (
    <div className="tool-feed">
      {activeTool && (
        <div className="tool-item tool-item-active">
          <span className="tool-indicator pulse" />
          <div className="tool-active-body">
            <div className="tool-active-name">{activeTool.toolName}</div>
            <div className="tool-active-summary">{activeTool.summary}</div>
            <div className="tool-active-meta">
              <span className="tool-elapsed">
                Running: {formatElapsed(activeTool.timestamp)}
              </span>
            </div>
          </div>
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
      {tools.length === 0 && !activeTool && (
        <div className="empty-state">
          <p>No tool calls yet.</p>
          <p className="hint">Tool calls will appear as the agent works.</p>
        </div>
      )}
    </div>
  );
};

function formatElapsed(timestamp: number): string {
  const s = Math.floor((Date.now() - timestamp) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
