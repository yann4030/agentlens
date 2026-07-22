import React from 'react';
import type { SessionStatus } from '../../common/types';

interface Props {
  status: SessionStatus;
}

const config: Record<SessionStatus, { icon: string; label: string; className: string }> = {
  working:     { icon: '', label: 'Working',     className: 'status-working' },
  done:        { icon: '', label: 'Done',        className: 'status-done' },
  interrupted: { icon: '', label: 'Stopped',     className: 'status-interrupted' },
  waiting:     { icon: '', label: 'Waiting',     className: 'status-waiting' },
  no_session:  { icon: '', label: 'No Session',  className: 'status-nosession' },
};

export const StatusBadge: React.FC<Props> = ({ status }) => {
  const cfg = config[status] || config.no_session;
  return (
    <span className={`status-badge ${cfg.className}`} title={`Agent is ${cfg.label.toLowerCase()}`}>
      <span className="status-label">{cfg.label}</span>
    </span>
  );
};
