import React from 'react';
import type { SessionStatus } from '../../common/types';

interface Props {
  status: SessionStatus;
}

const config: Record<SessionStatus, { icon: string; label: string; className: string }> = {
  working: { icon: '', label: 'Working', className: 'status-working' },
  done: { icon: '', label: 'Done', className: 'status-done' },
  interrupted: { icon: '', label: 'Interrupted', className: 'status-interrupted' },
  waiting: { icon: '', label: 'Waiting', className: 'status-waiting' },
  no_session: { icon: '', label: 'No Session', className: 'status-nosession' },
};

export const StatusBadge: React.FC<Props> = ({ status }) => {
  const { icon, label, className } = config[status] || config.no_session;
  return (
    <span className={`status-badge ${className}`} title={`Agent is ${label.toLowerCase()}`}>
      {icon && <span className="status-icon">{icon}</span>}
      <span className="status-label">{label}</span>
    </span>
  );
};
