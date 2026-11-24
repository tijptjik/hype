// @vitest-environment jsdom
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// ADDRESS UI
import { adaptivePlaceholder } from '#lib/bits/patterns/forms/formFeatureAddress/adaptivePlaceholder.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => setTimeout(() => callback(0), 16)),
  )
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => clearTimeout(frame))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('retains a numeric example in narrow fields and restores the full examples when space returns', () => {
  let resize = (): void => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe(): void {}
      disconnect(): void {}
    },
  )
  const canvas2d: { getContext(type: '2d'): CanvasRenderingContext2D | null } =
    HTMLCanvasElement.prototype
  vi.spyOn(canvas2d, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as CanvasRenderingContext2D)
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    fontStyle: 'italic',
    fontWeight: '500',
    fontSize: '16px',
    fontFamily: 'sans-serif',
    paddingLeft: '12px',
    paddingRight: '12px',
  } as CSSStyleDeclaration)
  const root = document.createElement('div')
  const input = document.createElement('input')
  input.id = 'address-en-buildingNumberExpression'
  input.placeholder = '25, 25A, 25–27'
  let width = 40
  Object.defineProperty(input, 'clientWidth', { get: () => width })
  root.append(input)
  document.body.append(root)
  const action = adaptivePlaceholder(root, input.placeholder)
  expect(input.placeholder).toBe('25')
  width = 300
  resize()
  vi.advanceTimersByTime(16)
  expect(input.placeholder).toBe('25, 25A, 25–27')
  width = 0
  resize()
  vi.advanceTimersByTime(16)
  expect(input.placeholder).toBe('25, 25A, 25–27')
  width = 200
  action.update('The Harbourside')
  vi.advanceTimersByTime(16)
  expect(input.placeholder).toBe('The Harbourside')
  action.update('1, II, B')
  vi.advanceTimersByTime(16)
  expect(input.placeholder).toBe('1, II, B')
  vi.mocked(requestAnimationFrame).mockClear()
  resize()
  resize()
  resize()
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  action.destroy()
  expect(vi.getTimerCount()).toBe(0)
})
