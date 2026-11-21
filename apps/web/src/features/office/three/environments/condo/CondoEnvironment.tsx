import { entranceOf } from '@ea/shared';
import { useMemo } from 'react';
import { mix } from '../../../../../components/pixel-art/shade';
import { GROUND } from '../../approach';
import { Lawn, LightPools, PieceMeshes, Water } from '../scenery';
import { townPieces } from '../town';
import type { EnvironmentDefinition, EnvironmentProps } from '../types';
import { condoPlan } from './plan';

// The modern condominium around the office (Phase 35): the clubhouse
// terrace and its pool, the inner roads, the modern houses, the gatehouse and
// the wall. At night the houses' glass glows, the bollards light the roads
// and the pool shines from under the water.

function CondoScene({ layout, light, reduced }: EnvironmentProps) {
  const dusk = 1 - light;
  // The condominium depends only on the size of the floor and where its entrance is.
  const entrance = entranceOf(layout);
  const key = `${layout.width}x${layout.height}@${entrance ? `${entrance.x},${entrance.y}` : '-'}`;
  const plan = useMemo(
    () => condoPlan(layout),
    // The key stands for the size and the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const pieces = useMemo(() => townPieces(plan.things, dusk, light), [plan, dusk, light]);
  const pools = useMemo(
    () => plan.lights.map((point) => ({ ...point, z: GROUND, r: 0.9 })),
    [plan],
  );
  const { pool } = plan;
  return (
    <group>
      <Lawn color={mix('#5fae5a', '#1f2c46', dusk * 0.5)} />
      <Water
        x={pool.x}
        y={pool.y}
        w={pool.w}
        d={pool.d}
        level={pool.level}
        color={mix('#2fb8d0', '#1c5a8a', dusk)}
        reduced={reduced}
        opacity={0.82}
      />
      <PieceMeshes pieces={pieces} layout={layout} />
      <LightPools spots={pools} dusk={dusk} />
    </group>
  );
}

export const CONDO: EnvironmentDefinition = {
  sky: {
    night: { top: '#0d0a26', bottom: '#3a2878' },
    day: { top: '#6fb0ec', bottom: '#e6f2ff' },
    clouds: 5,
  },
  fog: { start: 6, depth: 40 },
  Scene: CondoScene,
};
