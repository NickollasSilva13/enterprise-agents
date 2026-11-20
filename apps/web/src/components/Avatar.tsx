import type { AgentState, Appearance } from '@ea/shared';
import { AGENT_STATE_STYLES } from '../lib/agent-state';
import { TONES } from '../lib/tone';
import { AgentAvatar } from './AgentAvatar';

const SIZES = {
  sm: { px: 32, box: 'size-8 rounded-lg', dot: 'size-2.5' },
  md: { px: 48, box: 'size-12 rounded-xl', dot: 'size-3' },
  lg: { px: 72, box: 'size-18 rounded-2xl', dot: 'size-3.5' },
} as const;

interface AvatarProps {
  agentId: string;
  appearance: Appearance | null;
  /** Adds a dot in the state's colour; its name is read by screen readers. */
  state?: AgentState;
  size?: keyof typeof SIZES;
}

/**
 * The agent's pixel bust in a lit frame (Phase 20), with an optional state
 * dot. An inactive agent is drawn faded, as everywhere else.
 */
export function Avatar({ agentId, appearance, state, size = 'md' }: AvatarProps) {
  const dims = SIZES[size];
  const style = state ? AGENT_STATE_STYLES[state] : null;
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-visible border border-line bg-sheet-raised ${dims.box}`}
    >
      <span className={`overflow-hidden ${dims.box}`}>
        <AgentAvatar
          agentId={agentId}
          appearance={appearance}
          size={dims.px}
          dimmed={state === 'inactive'}
        />
      </span>
      {style && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-sheet ${dims.dot} ${
            state === 'inactive' ? 'border border-idle bg-sheet' : TONES[style.tone].dot
          }`}
        >
          <span className="sr-only">{style.label}</span>
        </span>
      )}
    </span>
  );
}
