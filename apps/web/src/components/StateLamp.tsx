import type { AgentState } from '@ea/shared';
import { AGENT_STATE_STYLES } from '../lib/agent-state';

/** Coloured dot plus the state name; the name is always present for non-colour cues. */
export function StateLamp({
  state,
  hideLabel = false,
}: {
  state: AgentState;
  hideLabel?: boolean;
}) {
  const style = AGENT_STATE_STYLES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${style.text}`}>
      <span className={`size-2.5 shrink-0 rounded-full ${style.lamp}`} aria-hidden />
      <span className={hideLabel ? 'sr-only' : ''}>{style.label}</span>
    </span>
  );
}
