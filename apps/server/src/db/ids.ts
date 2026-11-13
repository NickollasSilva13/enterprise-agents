import { monotonicFactory } from 'ulid';

// Monotonic: two ids created in the same millisecond still sort in creation
// order. Queries rely on this ("greatest id" means "most recent row").
const nextId = monotonicFactory();

/** Sortable unique id for new rows. */
export function newId(): string {
  return nextId();
}
