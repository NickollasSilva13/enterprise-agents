// The end-to-end tests run against real servers, each with its own throwaway
// database: one empty (a fresh installation), one with sample agents and
// runs, one that the tests are allowed to change, and one for the tools
// tests, whose many runs would otherwise crowd the dashboard of the others.

export const EMPTY_PORT = 4391;
export const SEEDED_PORT = 4392;
export const CRUD_PORT = 4393;
/** A fake model provider (see fake-provider.mjs). */
export const FAKE_PROVIDER_PORT = 4394;
export const TOOLS_PORT = 4395;

export const EMPTY_URL = `http://127.0.0.1:${EMPTY_PORT}`;
export const SEEDED_URL = `http://127.0.0.1:${SEEDED_PORT}`;
export const CRUD_URL = `http://127.0.0.1:${CRUD_PORT}`;
export const TOOLS_URL = `http://127.0.0.1:${TOOLS_PORT}`;
export const FAKE_PROVIDER_URL = `http://127.0.0.1:${FAKE_PROVIDER_PORT}`;
/** Not a real credential: only the fake provider accepts it. */
export const FAKE_PROVIDER_KEY = 'e2e-fake-key-0123456789';
