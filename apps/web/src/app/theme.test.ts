/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The visual system (Phase 20) promises WCAG AA contrast for every pairing it
// allows, and a 13 px floor for text. Both are checked here against the real
// theme.css and sources, so a colour or size tweak cannot quietly break them.

// Read from disk: Vitest turns CSS imports, ?raw included, into empty strings.
// Tests run from apps/web.
const css = readFileSync(join(process.cwd(), 'src', 'app', 'theme.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(css);
  if (!match?.[1]) throw new Error(`theme.css has no --color-${name}`);
  return match[1];
}

type Rgb = readonly [number, number, number];

const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** `top` at `alpha` over `bottom`, as the browser composites it. */
const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  [0, 1, 2].map((i) => top[i]! * alpha + bottom[i]! * (1 - alpha)) as unknown as Rgb;

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT = ['chalk', 'dim', 'ok', 'wait', 'fail', 'info', 'idle', 'glow'] as const;
const STATES = ['ok', 'wait', 'fail', 'info', 'idle', 'glow'] as const;

function surfaces(): Record<string, Rgb> {
  const sheet = rgb(token('sheet'));
  return {
    ink: rgb(token('ink')),
    sheet,
    'sheet-raised': rgb(token('sheet-raised')),
    // .surface-glass is 94% sheet; over the brightest thing in the scene.
    'vidro sobre branco': over(sheet, 0.94, [255, 255, 255]),
  };
}

describe('theme contrast (WCAG AA)', () => {
  it.each(TEXT)('text in %s reads on every surface (4.5:1)', (name) => {
    for (const [surface, colour] of Object.entries(surfaces())) {
      expect(contrast(rgb(token(name)), colour), `${name} sobre ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it.each(STATES)('a %s pill keeps its text readable on its own tint', (name) => {
    // StatusPill: text in the state colour over 15% of it, on a panel.
    for (const [surface, colour] of Object.entries(surfaces())) {
      const tint = over(rgb(token(name)), 0.15, colour);
      expect(contrast(rgb(token(name)), tint), `${name} sobre ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps white on both shades of the main button', () => {
    const white: Rgb = [255, 255, 255];
    expect(contrast(white, rgb(token('accent')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, rgb(token('accent-strong')))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the dark text of the danger button readable', () => {
    expect(contrast(rgb(token('ink')), rgb(token('fail')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(token('ink')), rgb(token('chalk')))).toBeGreaterThanOrEqual(4.5);
  });

  it('draws field edges and the focus ring at 3:1 on every surface', () => {
    for (const [surface, colour] of Object.entries(surfaces())) {
      for (const name of ['line-strong', 'glow']) {
        expect(
          contrast(rgb(token(name)), colour),
          `${name} sobre ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

/** Every source of the interface, by path from src/, tests left out. */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, text]) => [path.replace(/^\.\.\//, ''), text]),
);

describe('type scale', () => {
  it('sets the smallest step at 13 px', () => {
    expect(css).toMatch(/--text-xs:\s*0\.8125rem;/);
  });

  it('uses no arbitrary text size outside the office scene', () => {
    // The scene is an SVG that grows with the zoom, so its 7 px is not 7 px.
    const allowed = new Set(['features/office/OfficeScene.tsx']);
    const offenders = Object.entries(SOURCES)
      .filter(([path, text]) => !allowed.has(path) && /\btext-\[/.test(text))
      .map(([path]) => path);
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});

describe('state colours (Phase 31, D4 and D8)', () => {
  // The scene and the reference page draw with the tones themselves; every
  // other screen says a state through the components or TONES.
  const drawings = [
    'features/office/art/',
    'features/office/three/',
    'features/office/OfficeScene.tsx',
    'features/reference/',
  ];
  const STATE_CLASS =
    /\b(?:text|bg|border|ring|fill|stroke|outline|decoration)-(?:ok|wait|fail|info|idle)\b/;

  it('keeps raw state colours out of the screens', () => {
    const screens = Object.entries(SOURCES).filter(
      ([path]) =>
        (path.startsWith('features/') || path.startsWith('app/')) &&
        !drawings.some((prefix) => path.startsWith(prefix)),
    );
    expect(screens.length).toBeGreaterThan(40);
    const offenders = screens
      .filter(([, text]) => STATE_CLASS.test(text))
      .map(([path, text]) => `${path}: ${STATE_CLASS.exec(text)?.[0]}`);
    expect(offenders).toEqual([]);
  });
});

describe('reduced motion (Phase 32, D6)', () => {
  it('stops every animation and transition when the system asks for less motion', () => {
    // The scene's walk and the 3D poses read the same preference in code
    // (useReducedMotion); everything drawn by CSS stops here, at once.
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{\s*animation: none !important;\s*transition: none !important;/,
    );
  });

  it('animates only through the named animations of the theme', () => {
    const offenders = Object.entries(SOURCES)
      .filter(
        ([, text]) => /\banimate-\[/.test(text) || /\banimation:\s*[\w-]+\s+[\d.]+m?s/.test(text),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
