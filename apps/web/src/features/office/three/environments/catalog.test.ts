import { SURROUNDINGS, SURROUNDINGS_INFO } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_STATUS, environmentLabel } from './catalog';

describe('the environments catalog', () => {
  it('names each choice; since Phase 35 every one of them is drawn in 3D', () => {
    expect(environmentLabel('park')).toBe('Parque');
    expect(environmentLabel('building')).toBe('Cidade');
    expect(environmentLabel('house')).toBe('Bairro residencial');
    expect(environmentLabel('condo')).toBe('Condomínio moderno');
    for (const each of SURROUNDINGS) {
      expect(ENVIRONMENT_STATUS[each]).toEqual({ built: true });
      expect(environmentLabel(each)).toBe(SURROUNDINGS_INFO[each].label);
    }
  });
});
