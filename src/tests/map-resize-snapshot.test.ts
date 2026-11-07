// @vitest-environment jsdom
import { expect, it, vi, afterEach } from 'vitest'
import { freezeMapForResize, holdMapSizeDuringFlight } from '#lib/map/resizeSnapshot.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
afterEach(() => vi.restoreAllMocks())
it('keeps flights live with enough canvas for a growing pane and restores its size afterward', () => {
  const container = document.createElement('div')
  container.style.cssText = 'height:100%;width:100%'
  const original = container.getAttribute('style')
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 500,
    height: 300,
  } as DOMRect)
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200)
  const map = {
    getContainer: () => container,
    resize: vi.fn(),
    stop: vi.fn(),
  }
  const restore = holdMapSizeDuringFlight(map as unknown as MapLibreMap)
  expect(container.style.width).toBe('1200px')
  expect(container.style.height).toBe('300px')
  expect(container.style.pointerEvents).not.toBe('none')
  expect(container.querySelector('[data-map-resize-snapshot]')).toBeNull()
  expect(map.stop).not.toHaveBeenCalled()
  expect(map.resize).toHaveBeenCalledTimes(1)
  restore()
  expect(container.getAttribute('style')).toBe(original)
  expect(map.resize).toHaveBeenCalledTimes(2)
})

it('keeps the original WebGL canvas visible while layout settles without copying its pixels', () => {
  const container = document.createElement('div')
  const canvas = document.createElement('canvas')
  container.style.cssText = 'height:100%;width:100%'
  canvas.style.opacity = '0.8'
  const original = container.getAttribute('style')
  container.append(canvas)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 500,
    height: 300,
  } as DOMRect)
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  const map = {
    getContainer: () => container,
    stop: vi.fn(),
    resize: vi.fn(),
    triggerRepaint: vi.fn(),
  }
  const restore = freezeMapForResize(map as unknown as MapLibreMap)
  expect(map.stop).toHaveBeenCalledOnce()
  expect(container.style.width).toBe('500px')
  expect(container.style.height).toBe('300px')
  expect(container.style.pointerEvents).toBe('none')
  expect(container.querySelectorAll('canvas')).toHaveLength(1)
  expect(container.firstElementChild).toBe(canvas)
  expect(canvas.style.opacity).toBe('0.8')
  expect(getContext).not.toHaveBeenCalled()
  restore()
  expect(container.getAttribute('style')).toBe(original)
  expect(map.resize).toHaveBeenCalledOnce()
  expect(map.triggerRepaint).toHaveBeenCalledOnce()
  expect(canvas.style.opacity).toBe('0.8')
})
