/** Product mark: a floor plan with one lit room. */
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 font-bold tracking-tight">
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden className="shrink-0">
        <rect
          x="2"
          y="2"
          width="24"
          height="24"
          rx="3"
          fill="none"
          stroke="#f1edff"
          strokeWidth="2"
        />
        <path d="M14 2 V11 M14 17 V26 M2 14 H8 M20 14 H26" stroke="#f1edff" strokeWidth="2" />
        <rect x="16.5" y="4.5" width="7" height="7" rx="1" fill="#8467ff" />
      </svg>
      Enterprise Agents
    </span>
  );
}
