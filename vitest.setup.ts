import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

// Mock requestAnimationFrame and related timing functions
global.requestAnimationFrame = vi
  .fn()
  .mockImplementation((cb: FrameRequestCallback): number => {
    const timeoutId = setTimeout(cb, 0);
    return Number(timeoutId);
  });
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Mock SvelteKit $app modules
vi.mock('$app/environment', () => ({
  browser: false,
  dev: false,
  building: false,
  version: '1.0.0'
}));

vi.mock('$app/state', () => ({
  page: {
    subscribe: vi.fn(() => () => {}),
    url: new URL('http://localhost:3000'),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    form: null
  }
}));

// Mock SvelteKit global variables
global.__SVELTEKIT_PAYLOAD__ = {
  data: {},
  nodes: [],
  params: {},
  route: { id: null },
  url: new URL('http://localhost:3000')
};

// Mock Paraglide runtime
vi.mock('$lib/paraglide/runtime', async () => {
  const actual = await vi.importActual<any>('$lib/paraglide/runtime');
  return {
    ...actual,
    getLocale: vi.fn(() => 'en'),
    setLocale: vi.fn()
  };
});

// Mock Paraglide messages
vi.mock('$lib/paraglide/messages', async () => {
  const actual = await vi.importActual<any>('$lib/paraglide/messages');
  return actual;
});

// Reset mocks between tests
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
