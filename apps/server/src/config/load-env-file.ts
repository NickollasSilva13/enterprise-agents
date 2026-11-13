import { existsSync } from 'node:fs';
import { ENV_FILE } from './paths';

/** Loads the optional ".env" at the repository root. Real environment variables win. */
export function loadEnvFile(path = ENV_FILE): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
