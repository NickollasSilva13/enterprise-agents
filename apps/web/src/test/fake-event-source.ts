import { act } from '@testing-library/react';
import { vi } from 'vitest';

type Listener = (event: MessageEvent<string>) => void;

/**
 * Stands in for the browser's EventSource (jsdom has none), so tests can
 * push server events into the page and see which streams it opened.
 */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.OPEN;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Delivers a server event to the page. */
  emit(type: string, data: unknown): void {
    act(() => {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ data: JSON.stringify(data) } as MessageEvent<string>);
      }
    });
  }
}

/** Installs the fake for one test and returns a way to find the streams opened. */
export function installFakeEventSource() {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  return {
    /** The open stream for `url`, if the page has one. */
    open: (url: string) =>
      FakeEventSource.instances.find(
        (source) => source.url === url && source.readyState !== FakeEventSource.CLOSED,
      ),
    all: () => FakeEventSource.instances,
  };
}
