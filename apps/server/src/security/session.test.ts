import { describe, expect, it } from 'vitest';
import { createSessionToken, isValidSession } from './session';

describe('session token', () => {
  it('is long and different on every call', () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(43); // 32 random bytes in base64url
  });

  it('accepts only the exact token', () => {
    const token = createSessionToken();
    expect(isValidSession(token, token)).toBe(true);
    expect(isValidSession(`${token}x`, token)).toBe(false);
    expect(isValidSession(token.slice(0, -1), token)).toBe(false);
    expect(isValidSession('', token)).toBe(false);
    expect(isValidSession(undefined, token)).toBe(false);
  });
});
