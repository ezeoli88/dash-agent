import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './msw-server';
import { resetAllStores } from './reset-stores';

// ---------------------------------------------------------------------------
// MSW server lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Mock EventSource (not available in jsdom)
// ---------------------------------------------------------------------------

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState: number = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private listeners: Map<string, Function[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Function) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: Function) {
    const arr = this.listeners.get(type);
    if (arr) this.listeners.set(type, arr.filter((l) => l !== listener));
  }

  /** Helper to simulate a server-sent event in tests. */
  simulateMessage(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    const listeners = this.listeners.get(type) || [];
    listeners.forEach((l) => l(event));
    if (type === 'message' && this.onmessage) this.onmessage(event);
  }

  simulateOpen() {
    this.readyState = 1;
    if (this.onopen) this.onopen(new Event('open'));
  }

  simulateError() {
    this.readyState = 2;
    if (this.onerror) this.onerror(new Event('error'));
  }

  close() {
    this.readyState = 2;
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

// EventSource readyState constants
(MockEventSource as Record<string, unknown>).CONNECTING = 0;
(MockEventSource as Record<string, unknown>).OPEN = 1;
(MockEventSource as Record<string, unknown>).CLOSED = 2;

vi.stubGlobal('EventSource', MockEventSource);

// ---------------------------------------------------------------------------
// Cleanup between tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  MockEventSource.reset();
  resetAllStores();
  vi.restoreAllMocks();
});
