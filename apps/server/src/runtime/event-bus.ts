import type { RunStatus } from '@ea/shared';

export interface StepRecord {
  readonly runId: string;
  /** Order within the run, starting at 1. */
  readonly seq: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export type BusEvent =
  /** Something that happened in a run. Persisted before it is distributed. */
  | { readonly kind: 'step'; readonly runId: string; readonly step: StepRecord }
  /** A piece of model output. Not persisted: the final text is saved as a message. */
  | { readonly kind: 'delta'; readonly runId: string; readonly text: string }
  | {
      readonly kind: 'run_changed';
      readonly runId: string;
      readonly agentId: string;
      readonly conversationId: string | null;
      readonly status: RunStatus;
    };

export type BusListener = (event: BusEvent) => void;

/** Persists a step and returns it with its sequence number. */
export type StepWriter = (
  runId: string,
  type: string,
  payload: Record<string, unknown>,
) => StepRecord;

/**
 * Carries what the runtime does to whoever is watching (the SSE routes).
 * Steps are written to the database first, so a client that reconnects can
 * read what it missed; text deltas only exist while they are being produced.
 */
export class EventBus {
  private readonly listeners = new Set<BusListener>();

  constructor(private readonly writeStep: StepWriter) {}

  subscribe(listener: BusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  emitStep(runId: string, type: string, payload: Record<string, unknown> = {}): StepRecord {
    const step = this.writeStep(runId, type, payload);
    this.distribute({ kind: 'step', runId, step });
    return step;
  }

  emitDelta(runId: string, text: string): void {
    this.distribute({ kind: 'delta', runId, text });
  }

  emitRunChanged(run: {
    runId: string;
    agentId: string;
    conversationId: string | null;
    status: RunStatus;
  }): void {
    this.distribute({ kind: 'run_changed', ...run });
  }

  private distribute(event: BusEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // A broken subscriber (a closed socket, say) must never stop a run.
        this.listeners.delete(listener);
      }
    }
  }
}
