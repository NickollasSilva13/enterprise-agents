import { describe, expect, it } from 'vitest';
import { deriveAgentState } from './agent-state';

const base = { enabled: true, activeRunStatuses: [], lastFinishedStatus: null } as const;

describe('deriveAgentState', () => {
  it('is idle for an enabled agent that has never run', () => {
    expect(deriveAgentState(base)).toBe('idle');
  });

  it('is inactive when disabled, whatever its runs say', () => {
    expect(
      deriveAgentState({
        enabled: false,
        activeRunStatuses: ['running'],
        lastFinishedStatus: 'failed',
      }),
    ).toBe('inactive');
  });

  it.each(['queued', 'running'] as const)('is working with a %s run', (status) => {
    expect(deriveAgentState({ ...base, activeRunStatuses: [status] })).toBe('working');
  });

  it('is waiting when any run needs approval, even next to a running one', () => {
    expect(deriveAgentState({ ...base, activeRunStatuses: ['running', 'waiting_approval'] })).toBe(
      'waiting',
    );
  });

  it.each(['failed', 'timed_out'] as const)('is failed when the last run %s', (status) => {
    expect(deriveAgentState({ ...base, lastFinishedStatus: status })).toBe('failed');
  });

  it.each(['completed', 'cancelled', 'interrupted'] as const)(
    'is idle when the last run was %s',
    (status) => {
      expect(deriveAgentState({ ...base, lastFinishedStatus: status })).toBe('idle');
    },
  );

  it('shows current work over an old failure', () => {
    expect(
      deriveAgentState({ ...base, activeRunStatuses: ['running'], lastFinishedStatus: 'failed' }),
    ).toBe('working');
  });
});
