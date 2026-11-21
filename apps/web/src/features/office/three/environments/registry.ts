import type { Surroundings } from '@ea/shared';
import { CITY } from './city/CityEnvironment';
import { CONDO } from './condo/CondoEnvironment';
import { TECH_GARDEN } from './garden/TechGardenEnvironment';
import { ISLAND } from './island/IslandEnvironment';
import { NEIGHBORHOOD } from './neighborhood/NeighborhoodEnvironment';
import { PARK } from './park/ParkEnvironment';
import type { EnvironmentDefinition } from './types';

// The one place that says which environment draws each choice of
// `surroundings` (Phase 33, D4). A new environment: its folder (a pure plan
// and its scene), an entry here and its status in `catalog.ts`.

const BUILT: Readonly<Partial<Record<Surroundings, EnvironmentDefinition>>> = {
  building: CITY,
  house: NEIGHBORHOOD,
  park: PARK,
  condo: CONDO,
  island: ISLAND,
  techGarden: TECH_GARDEN,
};

/** The environment of a choice; one still planned is drawn as the city. */
export function environmentOf(surroundings: Surroundings): EnvironmentDefinition {
  return BUILT[surroundings] ?? CITY;
}
