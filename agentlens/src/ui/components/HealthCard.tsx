import React from 'react';
import type { SessionHealth } from '../../common/types';

interface Props {
  health: SessionHealth;
}

export const HealthCard: React.FC<Props> = ({ health }) => {
  if (health.toolCallCount === 0) return null;

  const elapsedMin = health.startTime
    ? Math.max(1, Math.floor((Date.now() - health.startTime) / 60000))
    : 1;
  const toolsPerMin = (health.toolCallCount / elapsedMin).toFixed(1);
  const score = healthScore(health);

  return (
    <div className="health-card">
      <h3 className="section-title">Session Health</h3>
      <div className="health-grid">
        <div className="health-metric">
          <span className="health-value">{health.toolCallCount}</span>
          <span className="health-label">Tool calls</span>
        </div>
        <div className="health-metric">
          <span className="health-value">{toolsPerMin}/min</span>
          <span className="health-label">Avg pace</span>
        </div>
        <div className="health-metric">
          <span className="health-value">{health.loopCount}</span>
          <span className="health-label">Loops detected</span>
        </div>
        <div className="health-metric">
          <span className="health-value">{health.stallCount}</span>
          <span className="health-label">Stalls detected</span>
        </div>
      </div>
      <div className="health-score">
        <span className="health-score-label">Health score</span>
        <span className={`health-score-value health-${score[0]}`}>{score}</span>
      </div>
    </div>
  );
};

function healthScore(h: SessionHealth): string {
  if (h.toolCallCount === 0) return 'N/A';
  let s = 100;
  s -= h.loopCount * 15;
  s -= h.stallCount * 10;
  s = Math.max(0, Math.min(100, s));
  if (s >= 80) return 'Good';
  if (s >= 50) return 'Fair';
  return 'Poor';
}
