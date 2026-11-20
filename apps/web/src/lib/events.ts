import {
  runDeltaEventSchema,
  runEndEventSchema,
  runSnapshotEventSchema,
  type RunStatus,
  type RunStep,
  runStepSchema,
} from '@ea/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ZodType } from 'zod';
import { ensureSession } from './api';

const RECONNECT_MS = 3000;

/** Queries whose content depends on what the agents are doing. */
const LIVE_QUERY_KEYS = [
  ['dashboard'],
  ['office'],
  // The office's recent activity (Phase 29).
  ['activity'],
  // The indicators (Phase 30).
  ['indicators'],
  ['agents'],
  ['runs'],
  ['conversations'],
  ['approvals'],
  // The bell and the menu counters (Phase 21).
  ['tasks-waiting'],
  ['requests'],
];

const liveEventsSupported = () => typeof EventSource !== 'undefined';

/** Reads the JSON of a server event; null if it is not what the contract says. */
function parseEvent<T>(event: Event, schema: ZodType<T>): T | null {
  try {
    const result = schema.safeParse(JSON.parse((event as MessageEvent<string>).data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Keeps every screen current: the server announces each run change on one
 * event stream and the affected queries are re-read. Mounted once, by the
 * layout. Without it the screens still refresh, only more slowly.
 */
export function useLiveRefresh(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!liveEventsSupported()) return;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const refresh = () => {
      for (const queryKey of LIVE_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey });
    };
    const retryLater = () => {
      if (!stopped) timer = setTimeout(() => void connect(true), RECONNECT_MS);
    };
    const connect = async (renewSession: boolean) => {
      try {
        // The stream needs the session cookie, which changes when the server restarts.
        await ensureSession(renewSession);
      } catch {
        retryLater();
        return;
      }
      if (stopped) return;
      source = new EventSource('/api/events');
      // "hello" arrives on every (re)connection: whatever was missed is reloaded.
      source.addEventListener('hello', refresh);
      source.addEventListener('run', refresh);
      source.onerror = () => {
        source?.close();
        source = null;
        retryLater();
      };
    };

    void connect(false);
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [queryClient]);
}

export interface RunStream {
  /** What the model has written so far in this run. */
  readonly text: string;
  readonly steps: readonly RunStep[];
  /** Null until the first event arrives. */
  readonly status: RunStatus | null;
}

const EMPTY_STREAM: RunStream = { text: '', steps: [], status: null };

/**
 * Follows one run live (RF-31): text as the model writes it and each step as
 * it happens. If the connection drops, the browser reconnects and the server
 * resends only the steps after the last one received, plus the full text.
 * `onEnd` is called once, when the run finishes or can no longer be followed.
 */
export function useRunStream(runId: string | null, onEnd: () => void): RunStream {
  const [state, setState] = useState<{ runId: string | null; stream: RunStream }>({
    runId: null,
    stream: EMPTY_STREAM,
  });
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (runId === null || !liveEventsSupported()) return;
    const update = (change: (stream: RunStream) => RunStream) =>
      setState((current) => ({
        runId,
        stream: change(current.runId === runId ? current.stream : EMPTY_STREAM),
      }));

    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      source.close();
      onEndRef.current();
    };

    source.addEventListener('snapshot', (event) => {
      const snapshot = parseEvent(event, runSnapshotEventSchema);
      // The snapshot carries the whole text so far, so it replaces what is here.
      if (snapshot) update((stream) => ({ ...stream, ...snapshot }));
    });
    source.addEventListener('delta', (event) => {
      const delta = parseEvent(event, runDeltaEventSchema);
      if (delta) update((stream) => ({ ...stream, text: stream.text + delta.text }));
    });
    source.addEventListener('step', (event) => {
      const step = parseEvent(event, runStepSchema);
      if (!step) return;
      update((stream) =>
        stream.steps.some((known) => known.seq === step.seq)
          ? stream
          : { ...stream, steps: [...stream.steps, step] },
      );
    });
    source.addEventListener('status', (event) => {
      const change = parseEvent(event, runEndEventSchema);
      if (change) update((stream) => ({ ...stream, status: change.status }));
    });
    source.addEventListener('end', (event) => {
      const end = parseEvent(event, runEndEventSchema);
      if (end) update((stream) => ({ ...stream, status: end.status }));
      finish();
    });
    source.onerror = () => {
      // CONNECTING means the browser is retrying by itself. CLOSED means the
      // server refused (it restarted, say): fall back to reloading the data.
      if (source.readyState === EventSource.CLOSED) finish();
    };

    return () => {
      finished = true;
      source.close();
    };
  }, [runId]);

  return state.runId === runId ? state.stream : EMPTY_STREAM;
}
