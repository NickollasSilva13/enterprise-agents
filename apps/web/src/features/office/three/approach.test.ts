import type { OfficeArea, OfficeItem } from '@ea/shared';
import { describe, expect, it } from 'vitest';
import { GROUND, logoBlocks, stepBlocks } from './approach';

describe('what belongs to the office in every environment', () => {
  it('runs the steps from the entrance down to the street', () => {
    const items = [{ kind: 'entrance', x: 5, y: 11 } as OfficeItem];
    const steps = stepBlocks({ height: 12, items });
    expect(steps.length).toBeGreaterThan(1);
    for (const step of steps) expect(step.z).toBe(GROUND);
    // Each step is lower than the one before, going away from the floor.
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]?.h).toBeLessThan(steps[index - 1]?.h ?? 0);
      expect(steps[index]?.y).toBeGreaterThan(steps[index - 1]?.y ?? 0);
    }
    expect(stepBlocks({ height: 12, items: [] })).toEqual([]);
  });

  it('hangs the mark on the back wall of the reception, lit', () => {
    const reception = { kind: 'reception', x: 6, y: 0, width: 4 } as OfficeArea;
    const blocks = logoBlocks({ areas: [reception], width: 18 });
    expect(blocks.some((block) => block.glow)).toBe(true);
    for (const block of blocks) {
      expect(block.x).toBeGreaterThanOrEqual(6);
      expect(block.x + block.w).toBeLessThanOrEqual(10);
    }
  });
});
