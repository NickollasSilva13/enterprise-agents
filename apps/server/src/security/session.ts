import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'ea_session';

/** API path that issues the session cookie; the only API route reachable without one. */
export const SESSION_PATH = '/api/session';

/** A fresh token per server start: sessions never outlive the process. */
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time comparison (hashing first makes both inputs the same length). */
export function isValidSession(candidate: string | undefined, expected: string): boolean {
  if (!candidate) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}
