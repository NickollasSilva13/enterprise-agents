import type { AgentState } from '@ea/shared';
import { AgentHead, agentLook, hashId } from '../../components/AgentAvatar';

// Original artwork (RF-08): a workstation seen from the front, with the agent
// sitting behind the desk. Everything is drawn with SVG attributes and CSS
// classes; nothing is loaded from outside and no inline style is used (CSP).
// Movement comes from the `desk-*` classes in theme.css, which the
// "reduce motion" preference switches off.

const WOOD_TOP = '#c79a6b';
const WOOD_FRONT = '#9c744c';
const WOOD_DARK = '#7a5a3a';
const CHAIR = '#3b4f7a';
const CHAIR_DARK = '#2c3c5e';
const METAL = '#56688c';
const CASE = '#26334f';
const PAPER = '#e8eef8';
const INK = '#0f1826';

const SCREEN: Record<AgentState, string> = {
  working: '#0b1f1a',
  waiting: '#2a2108',
  failed: '#2a0f0f',
  idle: '#101a2c',
  inactive: '#0b111c',
};

function Monitor({ state }: { state: AgentState }) {
  return (
    <g>
      <rect x="33" y="78" width="6" height="9" fill={METAL} />
      <rect x="26" y="85" width="20" height="3" rx="1.5" fill={METAL} />
      <rect x="14" y="50" width="44" height="30" rx="3" fill={CASE} />
      <rect x="17" y="53" width="38" height="24" rx="1.5" fill={SCREEN[state]} />
      {state === 'working' && (
        <g className="desk-code fill-ok">
          <rect x="20" y="57" width="22" height="2.5" rx="1" />
          <rect x="20" y="62" width="30" height="2.5" rx="1" />
          <rect x="20" y="67" width="16" height="2.5" rx="1" />
          <rect x="20" y="72" width="26" height="2.5" rx="1" />
        </g>
      )}
      {state === 'waiting' && (
        <path
          d="M31 61 q0 -5 5 -5 q5 0 5 4.5 q0 3 -3 4.5 q-2 1.2 -2 3.5 M36 73 v0.5"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-wait"
        />
      )}
      {state === 'failed' && (
        <path
          d="M36 57 v10 M36 73 v0.5"
          fill="none"
          strokeWidth="3.4"
          strokeLinecap="round"
          className="animate-lamp stroke-fail"
        />
      )}
      {state === 'idle' && <circle cx="24" cy="65" r="2.5" className="desk-saver fill-idle" />}
    </g>
  );
}

/** Something personal on the right side of the desk; which one depends on the agent. */
function DeskObject({ kind, steaming }: { kind: number; steaming: boolean }) {
  if (kind === 0) {
    return (
      <g>
        {steaming && (
          <path
            d="M127 72 q-2 -3 0 -6 M132 72 q-2 -3 0 -6"
            stroke={PAPER}
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
            className="desk-steam"
          />
        )}
        <rect x="124" y="75" width="11" height="11" rx="2" fill={PAPER} />
        <path
          d="M135 78 h2.5 a2.5 2.5 0 0 1 0 5 h-2.5"
          stroke={PAPER}
          strokeWidth="1.6"
          fill="none"
        />
      </g>
    );
  }
  if (kind === 1) {
    return (
      <g>
        <ellipse cx="124" cy="70" rx="4" ry="8" fill="#4fae7c" transform="rotate(-24 124 70)" />
        <ellipse cx="134" cy="70" rx="4" ry="8" fill="#5cc48c" transform="rotate(24 134 70)" />
        <ellipse cx="129" cy="67" rx="4" ry="9" fill="#6ad39a" />
        <rect x="122" y="77" width="14" height="9" rx="2" fill="#b5653b" />
      </g>
    );
  }
  if (kind === 2) {
    return (
      <g>
        <rect x="118" y="83" width="22" height="3" rx="1" fill={PAPER} />
        <rect x="120" y="80" width="20" height="3" rx="1" fill="#c9d4e8" />
        <rect x="117" y="77" width="22" height="3" rx="1" fill={PAPER} />
      </g>
    );
  }
  return (
    <g>
      <rect x="124" y="83" width="14" height="3" rx="1.5" fill={METAL} />
      <path
        d="M131 83 V68 L122 60"
        stroke={METAL}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M114 62 L124 54 L128 60 L118 66 Z" fill="#ffc24b" />
    </g>
  );
}

function Agent({ agentId, state }: { agentId: string; state: AgentState }) {
  const look = agentLook(agentId);
  return (
    <g className={state === 'idle' ? 'desk-breathe' : undefined}>
      {/* Arms first, so the body covers the shoulders. */}
      <rect
        x="54"
        y="66"
        width="9"
        height="24"
        rx="4.5"
        fill={look.body}
        className={state === 'working' ? 'desk-type-a' : undefined}
      />
      {state === 'waiting' ? (
        <g className="desk-wave">
          <rect x="98" y="40" width="9" height="30" rx="4.5" fill={look.body} />
          <circle cx="102.5" cy="39" r="5.5" fill={look.body} />
        </g>
      ) : (
        <rect
          x="97"
          y="66"
          width="9"
          height="24"
          rx="4.5"
          fill={look.body}
          className={state === 'working' ? 'desk-type-b' : undefined}
        />
      )}
      <rect x="62" y="56" width="36" height="36" rx="10" fill={look.body} />
      <rect x="62" y="56" width="36" height="36" rx="10" fill={INK} opacity="0.18" />
      {/* The class sits on an inner group: a CSS animation would replace the position. */}
      <g transform="translate(60 20)">
        <g className={state === 'failed' ? 'desk-shake' : undefined}>
          <AgentHead look={look} />
        </g>
      </g>
    </g>
  );
}

export function DeskScene({
  agentId,
  state,
  seated,
}: {
  agentId: string;
  state: AgentState;
  /** False while the agent is somewhere else in the office, or out of it (RF-80). */
  seated: boolean;
}) {
  const away = !seated;
  return (
    <svg
      viewBox="0 0 160 122"
      aria-hidden
      className={`block h-auto w-full ${state === 'inactive' ? 'opacity-60' : ''}`}
    >
      <ellipse cx="80" cy="117" rx="70" ry="5" fill={INK} opacity="0.35" />

      {/* An empty chair is pushed aside: the agent is not at the desk. */}
      <g transform={away ? 'translate(14 2) rotate(8 80 60)' : undefined}>
        <rect x="58" y="34" width="44" height="54" rx="10" fill={CHAIR} />
        <rect x="63" y="39" width="34" height="20" rx="6" fill={CHAIR_DARK} />
      </g>

      {!away && <Agent agentId={agentId} state={state} />}

      <rect x="10" y="86" width="140" height="10" rx="3" fill={WOOD_TOP} />
      <rect x="14" y="96" width="132" height="20" fill={WOOD_FRONT} />
      <rect x="14" y="96" width="132" height="3" fill={WOOD_DARK} opacity="0.55" />
      <rect x="118" y="104" width="16" height="3" rx="1.5" fill={WOOD_DARK} />
      <rect x="14" y="116" width="7" height="4" fill={WOOD_DARK} />
      <rect x="139" y="116" width="7" height="4" fill={WOOD_DARK} />

      <rect x="64" y="84" width="32" height="4" rx="1.5" fill={CASE} />
      <Monitor state={state} />
      <DeskObject kind={hashId(agentId) % 4} steaming={state === 'working'} />

      {state === 'waiting' && (
        <g className="animate-lamp">
          <circle cx="124" cy="26" r="10" className="fill-wait" />
          <path d="M124 20 v8 M124 32 v0.5" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {state === 'failed' && (
        <g>
          <circle cx="124" cy="26" r="10" className="fill-fail" />
          <path
            d="M119 21 L129 31 M129 21 L119 31"
            stroke={INK}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}

/** Night windows and a frame on the wall of a room. Decoration only. */
export function WallDecor({ seed }: { seed: number }) {
  const lit = [seed % 3, (seed >> 2) % 4, (seed >> 4) % 5];
  return (
    <svg viewBox="0 0 150 44" aria-hidden className="hidden h-11 w-auto shrink-0 sm:block">
      {[0, 54].map((x, index) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <rect
            x="1"
            y="2"
            width="44"
            height="38"
            rx="3"
            fill="#0b1220"
            stroke="#46608c"
            strokeWidth="2"
          />
          <path d="M23 2 V40 M1 21 H45" stroke="#46608c" strokeWidth="1.5" />
          <path d="M3 38 V30 h7 v-6 h6 v9 h7 v-12 h7 v8 h6 v-5 h7 v14 Z" fill="#1d2c48" />
          <rect x={8 + (lit[index] ?? 0) * 7} y="32" width="2" height="2" fill="#ffc24b" />
          <rect x={26 + (lit[2] ?? 0)} y="26" width="2" height="2" fill="#ffc24b" />
          {index === 0 ? (
            <circle cx="35" cy="11" r="4" fill="#e8eef8" />
          ) : (
            <>
              <circle cx="10" cy="9" r="0.9" fill="#e8eef8" />
              <circle cx="31" cy="13" r="0.9" fill="#e8eef8" />
              <circle cx="38" cy="7" r="0.9" fill="#e8eef8" />
            </>
          )}
        </g>
      ))}
      <rect
        x="112"
        y="8"
        width="34"
        height="26"
        rx="2"
        fill="#162238"
        stroke={WOOD_TOP}
        strokeWidth="2.5"
      />
      <path
        d={
          seed % 2 === 0 ? 'M116 28 L124 18 L130 24 L135 16 L142 28 Z' : 'M117 27 q6 -14 12 0 t12 0'
        }
        fill={seed % 2 === 0 ? '#5fe3a1' : 'none'}
        stroke="#7cc4ff"
        strokeWidth="1.5"
      />
    </svg>
  );
}
