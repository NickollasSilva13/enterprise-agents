import { fileURLToPath } from 'node:url';

/** Repository root, independent of the process working directory. */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export const SERVER_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export const WEB_DIST_DIR = fileURLToPath(new URL('../../../web/dist', import.meta.url));

export const ENV_FILE = fileURLToPath(new URL('../../../../.env', import.meta.url));
