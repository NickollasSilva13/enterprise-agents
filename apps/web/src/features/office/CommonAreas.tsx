// Original artwork for the parts of the office that belong to no project
// (RF-80): the doors, the reception and the pantry. Same rules as DeskScene:
// SVG attributes and CSS classes only, nothing loaded from outside, no
// `<text>` and no inline style.

const WOOD_TOP = '#c79a6b';
const WOOD_FRONT = '#9c744c';
const WOOD_DARK = '#7a5a3a';
const METAL = '#56688c';
const CASE = '#26334f';
const PAPER = '#e8eef8';
const INK = '#0f1826';
const GLASS = '#22395e';

/** The way out of an area to the corridor, on its wall. Characters walk through it. */
export function Doorway() {
  return (
    <svg viewBox="0 0 30 46" aria-hidden data-door className="block h-12 w-auto shrink-0">
      <rect x="1" y="1" width="28" height="45" rx="3" fill={WOOD_DARK} />
      <rect x="4" y="4" width="22" height="42" rx="1.5" fill="#131d30" />
      {/* The door itself, open against the frame. */}
      <path d="M4 4 L10 7 V46 H4 Z" fill={WOOD_FRONT} />
      <circle cx="8" cy="27" r="1.1" fill={PAPER} />
    </svg>
  );
}

/** The street door of the office: who is switched off leaves through it, new agents come in. */
export function StreetDoor() {
  return (
    <svg viewBox="0 0 52 70" aria-hidden data-entrance className="block h-20 w-auto shrink-0">
      <rect x="14" y="0" width="24" height="9" rx="2" className="fill-ok" />
      <path
        d="M20 4.5 h7 M24.5 2.5 l2.5 2 l-2.5 2 M30 2.5 v4"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="1" y="12" width="50" height="58" rx="3" fill={METAL} />
      <rect x="5" y="16" width="20" height="54" fill={GLASS} />
      <rect x="27" y="16" width="20" height="54" fill={GLASS} />
      <path d="M9 22 L19 34 M31 22 L41 34" stroke={PAPER} strokeWidth="1.4" opacity="0.35" />
      <rect x="21.5" y="38" width="2" height="12" rx="1" fill={PAPER} />
      <rect x="28.5" y="38" width="2" height="12" rx="1" fill={PAPER} />
    </svg>
  );
}

/** The reception counter, with a bell and a plant. Decoration only. */
export function ReceptionCounter() {
  return (
    <svg viewBox="0 0 150 70" aria-hidden className="block h-16 w-auto shrink-0 sm:h-20">
      <ellipse cx="75" cy="66" rx="70" ry="4" fill={INK} opacity="0.35" />
      <ellipse cx="22" cy="24" rx="5" ry="12" fill="#4fae7c" transform="rotate(-22 22 24)" />
      <ellipse cx="34" cy="24" rx="5" ry="12" fill="#5cc48c" transform="rotate(22 34 24)" />
      <ellipse cx="28" cy="20" rx="5" ry="13" fill="#6ad39a" />
      <rect x="18" y="34" width="20" height="32" rx="3" fill="#b5653b" />
      <rect x="46" y="30" width="100" height="9" rx="3" fill={WOOD_TOP} />
      <rect x="50" y="39" width="92" height="27" fill={WOOD_FRONT} />
      <rect x="50" y="39" width="92" height="3" fill={WOOD_DARK} opacity="0.55" />
      <rect x="58" y="47" width="76" height="12" rx="2" fill={WOOD_DARK} opacity="0.5" />
      <path d="M100 30 a9 9 0 0 1 18 0 Z" fill="#ffc24b" />
      <rect x="107.5" y="18" width="3" height="4" rx="1" fill="#ffc24b" />
      <rect x="62" y="16" width="26" height="14" rx="2" fill={CASE} />
      <rect x="73" y="28" width="4" height="3" fill={METAL} />
    </svg>
  );
}

/** The pantry: fridge, counter with a coffee machine, mugs and a water cooler. */
export function PantryCounter() {
  return (
    <svg viewBox="0 0 190 80" aria-hidden className="block h-16 w-auto shrink-0 sm:h-20">
      <ellipse cx="95" cy="76" rx="90" ry="4" fill={INK} opacity="0.35" />
      <rect x="4" y="4" width="34" height="72" rx="4" fill="#c9d4e8" />
      <path d="M4 30 H38" stroke={METAL} strokeWidth="2" />
      <rect x="31" y="12" width="3" height="12" rx="1.5" fill={METAL} />
      <rect x="31" y="36" width="3" height="18" rx="1.5" fill={METAL} />

      <rect x="44" y="40" width="104" height="8" rx="3" fill={WOOD_TOP} />
      <rect x="48" y="48" width="96" height="28" fill={WOOD_FRONT} />
      <rect x="48" y="48" width="96" height="3" fill={WOOD_DARK} opacity="0.55" />
      <path d="M96 52 V74" stroke={WOOD_DARK} strokeWidth="2" />
      <rect x="84" y="60" width="8" height="3" rx="1.5" fill={WOOD_DARK} />
      <rect x="100" y="60" width="8" height="3" rx="1.5" fill={WOOD_DARK} />

      <path
        d="M66 12 q-3 -4 0 -8 M74 12 q-3 -4 0 -8"
        stroke={PAPER}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        className="desk-steam"
      />
      <rect x="56" y="14" width="28" height="26" rx="3" fill={CASE} />
      <rect x="60" y="18" width="20" height="7" rx="1.5" fill="#0b1f1a" />
      <circle cx="64" cy="21.5" r="1.4" className="fill-ok" />
      <rect x="66" y="30" width="8" height="10" rx="1.5" fill={PAPER} />

      <rect x="96" y="31" width="9" height="9" rx="1.5" fill="#7cc4ff" />
      <rect x="108" y="31" width="9" height="9" rx="1.5" fill="#ffb38a" />
      <rect x="120" y="31" width="9" height="9" rx="1.5" fill="#c9a7ff" />

      <rect x="158" y="6" width="22" height="26" rx="6" fill="#7cc4ff" opacity="0.75" />
      <rect x="156" y="32" width="26" height="44" rx="3" fill={PAPER} />
      <rect x="164" y="40" width="10" height="5" rx="1.5" fill={METAL} />
      <rect x="165" y="52" width="8" height="9" rx="1.5" fill="#c9d4e8" />
    </svg>
  );
}
