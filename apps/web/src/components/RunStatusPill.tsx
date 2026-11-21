import type { RunStatus } from '@ea/shared';
import { RUN_STATUS } from '../lib/run-labels';
import { StatusPill } from './StatusPill';

/** How a run stands, in the same word and tone everywhere (Phase 31, D4). */
export function RunStatusPill({ status }: { status: RunStatus }) {
  const { label, tone } = RUN_STATUS[status];
  return (
    <StatusPill tone={tone} live={status === 'running'}>
      {label}
    </StatusPill>
  );
}
