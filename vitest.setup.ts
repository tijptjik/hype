import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

vi.mock('unique-names-generator', () => ({
  uniqueNamesGenerator: vi.fn(() => 'stubuser'),
  adjectives: [],
  colors: [],
  animals: [],
}))

// Explicit public env modules are generated at runtime in SvelteKit 3.
vi.mock('$app/env/public', () => ({
  PUBLIC_ASSET_BASE_URL: '',
  PUBLIC_PREVIEW_ASSET_BASE_URL: '',
  PUBLIC_RAW_ASSET_BASE_URL: '',
}))

// Mock requestAnimationFrame and related timing functions
global.requestAnimationFrame = vi
  .fn()
  .mockImplementation((cb: FrameRequestCallback): number => {
    const timeoutId = setTimeout(cb, 0)
    return Number(timeoutId)
  })
global.cancelAnimationFrame = vi.fn(id => clearTimeout(id))
global.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

// Reset mocks between tests
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})
