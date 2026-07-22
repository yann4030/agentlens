import React from 'react';
import type { TokenStats } from '../../common/types';

interface Props {
  tokens: TokenStats;
}

export const TokenBar: React.FC<Props> = ({ tokens }) => {
  const total = tokens.inputTokens + tokens.outputTokens;
  if (total === 0) return null;

  return (
    <div className="token-bar">
      <div className="token-bar-fill">
        <div className="token-fill-input" style={{ width: pct(tokens.inputTokens, total) + '%' }} />
        <div className="token-fill-output" style={{ width: pct(tokens.outputTokens, total) + '%' }} />
      </div>
      <div className="token-labels">
        <span className="token-label">In: {fmt(tokens.inputTokens)}</span>
        <span className="token-label">Out: {fmt(tokens.outputTokens)}</span>
        {tokens.cacheReadTokens > 0 && <span className="token-label token-cache">Cache: {fmt(tokens.cacheReadTokens)}</span>}
      </div>
      {tokens.timeline.length >= 2 && <TokenSparkline timeline={tokens.timeline} />}
    </div>
  );
};

function TokenSparkline({ timeline }: { timeline: { ts: number; input: number; output: number }[] }) {
  const max = Math.max(...timeline.map((p) => p.input + p.output), 1);
  const w = 100 / Math.max(timeline.length, 1);
  return (
    <div className="token-sparkline">
      {timeline.map((p, i) => (
        <div
          key={i}
          className="token-spark-bar"
          title={`+${fmt(p.input + p.output)} tokens`}
          style={{ width: `${w}%` }}
        >
          <div className="spark-in" style={{ height: pct(p.input, max) + '%' }} />
          <div className="spark-out" style={{ height: pct(p.output, max) + '%' }} />
        </div>
      ))}
    </div>
  );
}

function pct(v: number, total: number): number {
  return total > 0 ? Math.round((v / total) * 100) : 0;
}
function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();
}
