import type { AgentState, RunStatus } from '@ea/shared';

export interface AgentStateInput {
  readonly enabled: boolean;
  /** Statuses of the agent's runs that have not finished. */
  readonly activeRunStatuses: readonly RunStatus[];
  /** Status of the most recent finished run, if any. */
  readonly lastFinishedStatus: RunStatus | null;
}

const FAILURE_STATUSES: readonly RunStatus[] = ['failed', 'timed_out'];

/**
 * The single place that decides what state an agent is shown in.
 * "Needs the user" wins over "working" so a paused agent is never hidden
 * behind another run of the same agent.
 */
export function deriveAgentState(input: AgentStateInput): AgentState {
  if (!input.enabled) return 'inactive';
  if (input.activeRunStatuses.includes('waiting_approval')) return 'waiting';
  if (input.activeRunStatuses.length > 0) return 'working';
  if (input.lastFinishedStatus && FAILURE_STATUSES.includes(input.lastFinishedStatus)) {
    return 'failed';
  }
  return 'idle';
}
