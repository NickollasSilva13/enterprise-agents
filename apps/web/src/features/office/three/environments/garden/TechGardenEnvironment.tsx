import { entranceOf } from '@ea/shared';
import { useMemo } from 'react';
import { mix } from '../../../../../components/pixel-art/shade';
import { GROUND } from '../../approach';
import { Lawn, LightPools, PieceMeshes, Water } from '../scenery';
import { townPieces } from '../town';
import type { EnvironmentDefinition, EnvironmentProps } from '../types';
import { gardenPlan } from './plan';

// The technological garden around the office (Phase 36): the manicured lawn,
// the slate paths with their lines of light, the axis of pylons to the
// reflecting pool, the trees of light, the domes, the solar canopies and the
// turbines. At night it glows cyan and purple, as the office does.

function TechGardenScene({ layout, light, reduced }: EnvironmentProps) {
  const dusk = 1 - light;
  // The garden depends only on the size of the floor and where its entrance is.
  const entrance = entranceOf(layout);
  const key = `${layout.width}x${layout.height}@${entrance ? `${entrance.x},${entrance.y}` : '-'}`;
  const plan = useMemo(
    () => gardenPlan(layout),
    // The key stands for the size and the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const pieces = useMemo(() => townPieces(plan.things, dusk, light), [plan, dusk, light]);
  const pools = useMemo(
    () => plan.lights.map((point) => ({ ...point, z: GROUND, r: 1.2 })),
    [plan],
  );
  const { pool } = plan;
  return (
    <group>
      <Lawn color={mix('#5cb85a', '#1f2c46', dusk * 0.55)} />
      <Water
        x={pool.x}
        y={pool.y}
        w={pool.w}
        d={pool.d}
        level={GROUND + 0.1}
        color={mix('#4f86b8', '#1a2a5a', dusk)}
        reduced={reduced}
        opacity={0.85}
      />
      <PieceMeshes pieces={pieces} layout={layout} />
      <LightPools spots={pools} dusk={dusk} />
    </group>
  );
}

export const TECH_GARDEN: EnvironmentDefinition = {
  sky: {
    night: { top: '#0d0a26', bottom: '#3a2878' },
    day: { top: '#74b2ef', bottom: '#e9f3ff' },
    clouds: 6,
  },
  fog: { start: 6, depth: 40 },
  Scene: TechGardenScene,
};
