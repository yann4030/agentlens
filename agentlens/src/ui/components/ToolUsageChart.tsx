import React from 'react';
import type { ToolCallLog } from '../../common/types';

interface Props {
  tools: ToolCallLog[];
}

export const ToolUsageChart: React.FC<Props> = ({ tools }) => {
  if (tools.length === 0) return null;

  const counts = new Map<string, number>();
  for (const t of tools) {
    counts.set(t.toolName, (counts.get(t.toolName) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  return (
    <div className="tool-usage">
      <h3 className="section-title">Tool Usage</h3>
      {sorted.map(([name, count]) => (
        <div key={name} className="tool-usage-row">
          <span className="tool-usage-name">{name}</span>
          <span className="tool-usage-bar-wrap">
            <span className="tool-usage-bar" style={{ width: `${Math.round((count / max) * 100)}%` }} />
          </span>
          <span className="tool-usage-count">{count}</span>
        </div>
      ))}
    </div>
  );
};
