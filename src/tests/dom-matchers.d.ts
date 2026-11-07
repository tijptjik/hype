import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import 'vitest'

// Vitest 5 separates the assertion return type from the received value type.
// Extend its public matcher interface while jest-dom still targets Assertion<T>.
declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<T, R> {}
}
