import type { AuditActor } from '@ea/shared';
import type { Db } from '../../db/client';
import { newId } from '../../db/ids';
import { auditLog } from '../../db/schema';
import { redactSecrets } from '../../security/redact';

export interface AuditEntry {
  readonly actor: AuditActor;
  /** What happened, as "<area>.<verb>", e.g. "provider.created". */
  readonly action: string;
  /** What it happened to: usually an id. */
  readonly target?: string;
  readonly agentId?: string;
  readonly runId?: string;
  /** Extra context. Never put a credential here; strings are redacted anyway. */
  readonly details?: Record<string, unknown>;
}

function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item)]));
  }
  return value;
}

/**
 * Records a sensitive operation (SECURITY C-23). The table accepts inserts
 * only: database triggers refuse updates and deletes.
 */
export function recordAudit(db: Db, entry: AuditEntry): void {
  db.insert(auditLog)
    .values({
      id: newId(),
      actor: entry.actor,
      action: entry.action,
      target: entry.target ?? null,
      agentId: entry.agentId ?? null,
      runId: entry.runId ?? null,
      details: entry.details ? redactDeep(entry.details) : null,
    })
    .run();
}
