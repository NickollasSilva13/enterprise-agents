import type { OfficeLayout } from '@ea/shared';
import type { ComponentType } from 'react';
import type { SkyPalette } from '../Surroundings';

// What an environment around the 3D office is made of (Phase 33, D4). Each
// one draws only outside the platform (with `CLEARANCE` around it) and brings
// no light that reaches the office: the sun and the ambient of `Lights` are
// the same in all of them, so changing environment never changes the office.

export interface EnvironmentProps {
  readonly layout: OfficeLayout;
  /** 0 at night, 1 by day (`useDaylight`). */
  readonly light: number;
  /** The system asks for less motion: nothing moves (water, leaves). */
  readonly reduced: boolean;
}

export interface EnvironmentDefinition {
  readonly sky: SkyPalette;
  /** Tiles past the farthest corner of the office where the haze begins, and how deep it is. */
  readonly fog: { readonly start: number; readonly depth: number };
  /** The ground, the decor, the plants and the lights of its own. */
  readonly Scene: ComponentType<EnvironmentProps>;
}
