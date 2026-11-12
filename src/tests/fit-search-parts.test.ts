// @vitest-environment jsdom
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// UI
import { fitSearchParts } from '#lib/bits/patterns/forms/featureLocation/fitSearchParts.js'

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
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('drops the broadest geography before street details and restores parts when room returns', () => {
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
  const strip = document.createElement('span')
  strip.style.columnGap = '24px'
  let available = 320
  Object.defineProperty(strip, 'clientWidth', { get: () => available })
  const parts = [
    ['Building', 4, 130],
    ['Street', 7, 120],
    ['Neighbourhood', 17, 90],
    ['Town', 20, 70],
  ].map(([label, priority, width]) => {
    const part = document.createElement('span')
    part.textContent = String(label)
    part.dataset.omissionPriority = String(priority)
    Object.defineProperty(part, 'scrollWidth', { value: width })
    strip.append(part)
    return part
  })
  document.body.append(strip)
  const action = fitSearchParts(strip)
  expect(parts.map(part => part.style.display)).toEqual(['', '', 'none', 'none'])
  available = 420
  resize()
  vi.advanceTimersByTime(16)
  expect(parts.map(part => part.style.display)).toEqual(['', '', '', 'none'])
  available = 70
  resize()
  vi.advanceTimersByTime(16)
  expect(parts.map(part => part.style.display)).toEqual(['', 'none', 'none', 'none'])
  available = 600
  resize()
  vi.advanceTimersByTime(16)
  expect(parts.map(part => part.style.display)).toEqual(['', '', '', ''])
  vi.mocked(requestAnimationFrame).mockClear()
  resize()
  resize()
  resize()
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  action.destroy()
  expect(vi.getTimerCount()).toBe(0)
})

it('measures the scroller text rather than a collapsed viewport, then reserves a readable identity width', () => {
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
  const strip = document.createElement('span')
  strip.style.columnGap = '24px'
  let available = 150
  Object.defineProperty(strip, 'clientWidth', { get: () => available })
  const identity = document.createElement('span')
  const content = document.createElement('span')
  content.className = 'bits-scrollable-text__content'
  content.textContent = 'A long establishment name'
  Object.defineProperty(content, 'scrollWidth', { value: 200 })
  identity.append(content)
  Object.defineProperty(identity, 'scrollWidth', {
    get: () => parseFloat(identity.style.width) || 0,
  })
  const street = document.createElement('span')
  street.dataset.omissionPriority = '7'
  Object.defineProperty(street, 'scrollWidth', { value: 100 })
  strip.append(identity, street)
  document.body.append(strip)
  const action = fitSearchParts(strip)
  expect(identity.style.width).toBe('150px')
  expect(street.style.display).toBe('none')
  available = 350
  resize()
  vi.advanceTimersByTime(16)
  expect(identity.style.width).toBe('200px')
  expect(street.style.display).toBe('')
  action.destroy()
})
