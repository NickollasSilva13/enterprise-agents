const REDACTED = '[redacted]';

// Shapes that are credentials wherever they appear, known secret or not.
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(x-api-key|api[-_]?key|authorization)(["']?\s*[:=]\s*["']?)[^\s"',}]{8,}/gi,
];

/**
 * Removes credentials from text that is about to be logged or stored
 * (SECURITY C-10). `knownSecrets` are removed verbatim; the patterns catch
 * credentials this process has never seen, such as one echoed by a provider.
 */
export function redactSecrets(text: string, knownSecrets: readonly string[] = []): string {
  let result = text;
  for (const secret of knownSecrets) {
    if (secret.length >= 4) result = result.split(secret).join(REDACTED);
  }
  result = result.replace(CREDENTIAL_PATTERNS[0]!, REDACTED);
  result = result.replace(CREDENTIAL_PATTERNS[1]!, `$1 ${REDACTED}`);
  result = result.replace(CREDENTIAL_PATTERNS[2]!, `$1$2${REDACTED}`);
  return result;
}

/** What the UI may show of a stored key: that it exists and how it ends (C-09). */
export function secretHint(secret: string): string {
  return secret.length >= 12 ? `…${secret.slice(-4)}` : '…';
}
