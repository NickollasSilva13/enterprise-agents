import { type Surroundings, SURROUNDINGS_INFO } from '@ea/shared';

// Which surroundings already have their own 3D environment (Phase 33, D7).
// Kept apart from the environments themselves, with no three.js, so the
// editor's list reads it without loading the 3D scene. One not built yet is
// drawn in 3D as the city and says in which phase it is planned.

export type EnvironmentStatus = { readonly built: true } | { readonly planned: number };

export const ENVIRONMENT_STATUS: Readonly<Record<Surroundings, EnvironmentStatus>> = {
  building: { built: true },
  house: { built: true },
  park: { built: true },
  condo: { built: true },
  island: { built: true },
  techGarden: { built: true },
};

/** The name in the editor's list, with the phase of what is not drawn in 3D yet. */
export function environmentLabel(surroundings: Surroundings): string {
  const status = ENVIRONMENT_STATUS[surroundings];
  const label = SURROUNDINGS_INFO[surroundings].label;
  return 'planned' in status ? `${label} (em 3D: planejado para a Fase ${status.planned})` : label;
}
