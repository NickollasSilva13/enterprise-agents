import { entranceOf } from '@ea/shared';
import { useMemo } from 'react';
import { mix } from '../../../../../components/pixel-art/shade';
import { GROUND } from '../../approach';
import { Lawn, LightPools, PieceMeshes } from '../scenery';
import { townPieces } from '../town';
import type { EnvironmentDefinition, EnvironmentProps } from '../types';
import { neighborhoodPlan } from './plan';

// The residential neighbourhood around the office (Phase 35): lawns, the two
// streets, houses with their yards, the neighbours' gardens, street trees,
// lamps and cars. At night the windows light up one by one and the lamps cast
// their light on the pavement.

function NeighborhoodScene({ layout, light }: EnvironmentProps) {
  const dusk = 1 - light;
  // The street depends only on the size of the floor and where its entrance is.
  const entrance = entranceOf(layout);
  const key = `${layout.width}x${layout.height}@${entrance ? `${entrance.x},${entrance.y}` : '-'}`;
  const plan = useMemo(
    () => neighborhoodPlan(layout),
    // The key stands for the size and the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  // The windows change with the light, minute by minute at dusk.
  const pieces = useMemo(() => townPieces(plan.things, dusk, light), [plan, dusk, light]);
  const pools = useMemo(
    () => plan.lamps.map((lamp) => ({ x: lamp.x, y: lamp.y, z: GROUND, r: 1.8 })),
    [plan],
  );
  return (
    <group>
      <Lawn color={mix('#6aa85a', '#1f2c46', dusk * 0.5)} />
      <PieceMeshes pieces={pieces} layout={layout} />
      <LightPools spots={pools} dusk={dusk} />
    </group>
  );
}

export const NEIGHBORHOOD: EnvironmentDefinition = {
  sky: {
    night: { top: '#0d0a26', bottom: '#3a2878' },
    day: { top: '#79b6ee', bottom: '#e2f0ff' },
    clouds: 7,
  },
  fog: { start: 6, depth: 40 },
  Scene: NeighborhoodScene,
};
