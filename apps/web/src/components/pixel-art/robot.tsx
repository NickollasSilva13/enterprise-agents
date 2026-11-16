import { hashText } from '@ea/shared';

// Original artwork: a small robot face drawn from the agent id. It is the
// look of every agent that has no appearance chosen (Phase 14).

const BODY_COLORS = ['#7cc4ff', '#c9a7ff', '#ffb38a', '#8fe8d4', '#f6a6c8', '#d8e27a'] as const;
const INK = '#0f1826';

/** Small stable hash, so the same id always draws the same face. */
export const hashId = hashText;

export interface AgentLook {
  readonly body: string;
  readonly roundEyes: boolean;
  readonly twoAntennas: boolean;
  /** 0, 1 or 2: which mouth is drawn. */
  readonly smile: number;
}

/** How an agent looks, decided only by its id. */
export function agentLook(agentId: string): AgentLook {
  const seed = hashId(agentId);
  return {
    body: BODY_COLORS[seed % BODY_COLORS.length] ?? BODY_COLORS[0],
    roundEyes: (seed >> 3) % 2 === 0,
    twoAntennas: (seed >> 4) % 2 === 0,
    smile: (seed >> 5) % 3,
  };
}

/** The robot head, drawn inside a 40 by 40 box. For use within an `<svg>`. */
export function AgentHead({ look }: { look: AgentLook }) {
  const { body, roundEyes, twoAntennas, smile } = look;
  return (
    <>
      {twoAntennas ? (
        <>
          <path d="M14 9 V4 M26 9 V4" stroke={body} strokeWidth="2" strokeLinecap="round" />
          <circle cx="14" cy="3.5" r="1.8" fill={body} />
          <circle cx="26" cy="3.5" r="1.8" fill={body} />
        </>
      ) : (
        <>
          <path d="M20 9 V4" stroke={body} strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="3.5" r="2" fill={body} />
        </>
      )}
      <rect x="5" y="9" width="30" height="27" rx="7" fill={body} />
      <rect x="9" y="14" width="22" height="12" rx="4" fill={INK} />
      {roundEyes ? (
        <>
          <circle cx="15.5" cy="20" r="2.4" fill={body} />
          <circle cx="24.5" cy="20" r="2.4" fill={body} />
        </>
      ) : (
        <>
          <rect x="13" y="18.5" width="5" height="3" rx="1" fill={body} />
          <rect x="22" y="18.5" width="5" height="3" rx="1" fill={body} />
        </>
      )}
      {smile === 0 && <path d="M16 30.5 H24" stroke={INK} strokeWidth="2" strokeLinecap="round" />}
      {smile === 1 && (
        <path
          d="M15.5 29.5 Q20 33 24.5 29.5"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {smile === 2 && <rect x="16" y="29" width="8" height="3" rx="1.5" fill={INK} />}
    </>
  );
}
