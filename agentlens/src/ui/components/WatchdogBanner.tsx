import React from 'react';
import type { WatchdogStatus } from '../../common/types';

interface Props {
  watchdog: WatchdogStatus;
}

export const WatchdogBanner: React.FC<Props> = ({ watchdog }) => {
  if (watchdog.isNormal) return null;

  const isCritical = watchdog.stallDetected && watchdog.loopDetected;

  const className = isCritical
    ? 'banner banner-critical'
    : watchdog.stallDetected
      ? 'banner banner-warning'
      : 'banner banner-alert';

  const icon = isCritical ? '!' : watchdog.stallDetected ? 'S' : 'L';

  return (
    <div className={className}>
      <span className="banner-icon">{icon}</span>
      <span className="banner-text">
        {watchdog.warningMessage || 'Watchdog alert'}
      </span>
      {!watchdog.isNormal && (
        <span className="banner-confidence">
          {Math.round(watchdog.loopConfidence * 100)}%
        </span>
      )}
    </div>
  );
};
