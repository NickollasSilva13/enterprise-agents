import { describe, expect, it } from 'vitest';
import { newId } from './ids';

describe('newId', () => {
  it('creates unique ids that sort in creation order, even within one millisecond', () => {
    const ids = Array.from({ length: 5000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});
