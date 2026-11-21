import {
  ACCESSORIES,
  type Appearance,
  APPEARANCE_LABELS,
  defaultAppearance,
  EYE_COLORS,
  FACIAL_HAIR,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFITS,
  PANTS_COLORS,
  PATTERNS,
  randomAppearance,
  SHOE_COLORS,
  SKIN_TONES,
} from '@ea/shared';
import { Dices } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../../components/Button';
import { SelectField } from '../../components/Form';
import { PixelCharacter } from '../../components/pixel-art/character';
import { EYES, HAIR, OUTFIT, PANTS, SHOES, SKIN } from '../../components/pixel-art/palette';
import { usePortrait } from '../../components/use-portrait';

// How the agent looks in the office and in its avatar (Phase 14). Colours are
// picked from swatches drawn in SVG (fill attribute, never inline style).

function Swatches<T extends string>({
  label,
  options,
  labels,
  colors,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  colors: Record<T, readonly [string, string]>;
  value: T;
  onChange: (value: T) => void;
}) {
  // An id from the label would break `aria-labelledby` on labels with spaces.
  const id = useId();
  return (
    <div>
      <p className="mb-1 text-sm font-semibold" id={id}>
        {label}: <span className="font-normal text-dim">{labels[value]}</span>
      </p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            aria-label={labels[option]}
            title={labels[option]}
            onClick={() => onChange(option)}
            className={`grid size-8 place-items-center rounded-md border-2 ${
              option === value ? 'border-chalk' : 'border-transparent hover:border-line-strong'
            }`}
          >
            <svg viewBox="0 0 10 10" className="size-6" aria-hidden>
              <rect width="10" height="10" rx="2" fill={colors[option][0]} />
              <rect y="6" width="10" height="4" rx="1" fill={colors[option][1]} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function Preview({ agentId, appearance }: { agentId: string; appearance: Appearance }) {
  // The robot is drawn from the id, as in the office: its look is not stored.
  const picture = usePortrait(agentId, appearance.kind === 'robot' ? null : appearance, 'full');
  // The whole voxel figure of the office; until it is drawn, or without WebGL, the 2D one.
  if (picture)
    return (
      <img
        src={picture}
        alt=""
        aria-hidden
        draggable={false}
        className="h-44 w-36 shrink-0 rounded-lg bg-sheet-raised"
      />
    );
  return (
    <svg
      viewBox="-12 -34 24 36"
      className="h-44 w-36 shrink-0 rounded-lg bg-sheet-raised"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <PixelCharacter agentId={agentId} appearance={appearance} pose="stand" />
    </svg>
  );
}

export function AppearanceFields({
  agentId,
  value,
  onChange,
}: {
  /** The agent's id, or any stable text for a new agent: the robot is drawn from it. */
  agentId: string;
  /** Null: the robot drawn from the id. */
  value: Appearance | null;
  onChange: (value: Appearance | null) => void;
}) {
  const look = value ?? defaultAppearance(agentId);
  const set = <K extends keyof Appearance>(field: K, option: Appearance[K]) =>
    onChange({ ...look, [field]: option });
  const L = APPEARANCE_LABELS;
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex flex-col items-center gap-2">
        <Preview agentId={agentId} appearance={look} />
        <Button onClick={() => onChange(randomAppearance(Math.random))}>
          <Dices className="size-4" aria-hidden />
          Sortear
        </Button>
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div role="radiogroup" aria-label="Personagem" className="flex gap-2">
          {(['person', 'robot'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={look.kind === kind}
              onClick={() => (kind === 'robot' ? onChange(null) : set('kind', 'person'))}
              className={`min-h-10 rounded-md border px-4 text-sm font-semibold ${
                look.kind === kind
                  ? 'border-accent bg-accent text-white'
                  : 'border-line-strong hover:bg-sheet-raised'
              }`}
            >
              {L.kind[kind]}
            </button>
          ))}
        </div>
        {look.kind === 'robot' ? (
          <p className="text-sm text-dim">
            O robô tem cor e rosto tirados do próprio agente, os mesmos de sempre.
          </p>
        ) : (
          <>
            <Swatches
              label="Pele"
              options={SKIN_TONES}
              labels={L.skin}
              colors={SKIN}
              value={look.skin}
              onChange={(v) => set('skin', v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Cabelo"
                value={look.hair}
                onChange={(event) => set('hair', event.target.value as Appearance['hair'])}
              >
                {HAIR_STYLES.map((option) => (
                  <option key={option} value={option}>
                    {L.hair[option]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Roupa"
                value={look.outfit}
                onChange={(event) => set('outfit', event.target.value as Appearance['outfit'])}
              >
                {OUTFITS.map((option) => (
                  <option key={option} value={option}>
                    {L.outfit[option]}
                  </option>
                ))}
              </SelectField>
            </div>
            <Swatches
              label="Cor do cabelo"
              options={HAIR_COLORS}
              labels={L.hairColor}
              colors={HAIR}
              value={look.hairColor}
              onChange={(v) => set('hairColor', v)}
            />
            <Swatches
              label="Cor da roupa"
              options={OUTFIT_COLORS}
              labels={L.outfitColor}
              colors={OUTFIT}
              value={look.outfitColor}
              onChange={(v) => set('outfitColor', v)}
            />
            <Swatches
              label="Calça"
              options={PANTS_COLORS}
              labels={L.pants}
              colors={PANTS}
              value={look.pants}
              onChange={(v) => set('pants', v)}
            />
            <Swatches
              label="Olhos"
              options={EYE_COLORS}
              labels={L.eyes}
              colors={EYES}
              value={look.eyes}
              onChange={(v) => set('eyes', v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Barba"
                value={look.facialHair}
                onChange={(event) =>
                  set('facialHair', event.target.value as Appearance['facialHair'])
                }
              >
                {FACIAL_HAIR.map((option) => (
                  <option key={option} value={option}>
                    {L.facialHair[option]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Estampa"
                value={look.pattern}
                onChange={(event) => set('pattern', event.target.value as Appearance['pattern'])}
              >
                {PATTERNS.map((option) => (
                  <option key={option} value={option}>
                    {L.pattern[option]}
                  </option>
                ))}
              </SelectField>
            </div>
            <Swatches
              label="Calçado"
              options={SHOE_COLORS}
              labels={L.shoes}
              colors={SHOES}
              value={look.shoes}
              onChange={(v) => set('shoes', v)}
            />
            <SelectField
              label="Acessório"
              value={look.accessory}
              onChange={(event) => set('accessory', event.target.value as Appearance['accessory'])}
            >
              {ACCESSORIES.map((option) => (
                <option key={option} value={option}>
                  {L.accessory[option]}
                </option>
              ))}
            </SelectField>
          </>
        )}
      </div>
    </div>
  );
}
