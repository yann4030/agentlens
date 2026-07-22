import React from 'react';
import type { TokenStats } from '../../common/types';

interface Props {
  tokens: TokenStats;
}

export const TokenBar: React.FC<Props> = ({ tokens }) => {
  const total = tokens.inputTokens + tokens.outputTokens;
  if (total === 0) return null;

  const inputPct = total > 0 ? Math.round((tokens.inputTokens / total) * 100) : 0;
  const outputPct = total > 0 ? Math.round((tokens.outputTokens / total) * 100) : 0;
  const cachePct = tokens.cacheReadTokens > 0 ? Math.round((tokens.cacheReadTokens / total) * 100) : 0;

  return (
    <div className="token-bar">
      <div className="token-bar-fill">
        <div className="token-fill-input" style={{ width: `${inputPct}%` }} title={`Input: ${tokens.inputTokens.toLocaleString()}`} />
        <div className="token-fill-output" style={{ width: `${outputPct}%` }} title={`Output: ${tokens.outputTokens.toLocaleString()}`} />
      </div>
      <div className="token-labels">
        <span className="token-label">In: {formatK(tokens.inputTokens)}</span>
        <span className="token-label">Out: {formatK(tokens.outputTokens)}</span>
        {tokens.cacheReadTokens > 0 && (
          <span className="token-label token-cache">Cache: {formatK(tokens.cacheReadTokens)}</span>
        )}
      </div>
    </div>
  );
};

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}
