// Original artwork: a small robot face drawn from the agent id, so every
// agent keeps the same face everywhere without storing an image.

const BODY_COLORS = ['#7cc4ff', '#c9a7ff', '#ffb38a', '#8fe8d4', '#f6a6c8', '#d8e27a'] as const;

/** Small stable hash (FNV-1a) so the same id always draws the same face. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

interface AgentAvatarProps {
  agentId: string;
  /** Rendered size in pixels. */
  size?: number;
  dimmed?: boolean;
}

export function AgentAvatar({ agentId, size = 40, dimmed = false }: AgentAvatarProps) {
  const seed = hash(agentId);
  const body = BODY_COLORS[seed % BODY_COLORS.length];
  const roundEyes = (seed >> 3) % 2 === 0;
  const twoAntennas = (seed >> 4) % 2 === 0;
  const smile = (seed >> 5) % 3;
  const ink = '#0f1826';

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden
      className="shrink-0"
      opacity={dimmed ? 0.45 : 1}
    >
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
      <rect x="9" y="14" width="22" height="12" rx="4" fill={ink} />
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
      {smile === 0 && <path d="M16 30.5 H24" stroke={ink} strokeWidth="2" strokeLinecap="round" />}
      {smile === 1 && (
        <path
          d="M15.5 29.5 Q20 33 24.5 29.5"
          stroke={ink}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {smile === 2 && <rect x="16" y="29" width="8" height="3" rx="1.5" fill={ink} />}
    </svg>
  );
}
