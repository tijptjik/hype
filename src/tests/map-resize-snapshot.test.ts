// @vitest-environment jsdom
import { expect, it, vi, afterEach } from 'vitest'
import { freezeMapForResize } from '#lib/map/resizeSnapshot.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
afterEach(() => vi.restoreAllMocks())
it('holds a captured frame and restores styles only after the resized map renders', () => {
  const container = document.createElement('div'),
    canvas = document.createElement('canvas')
  container.style.cssText = 'height:100%;width:100%'
  const original = container.getAttribute('style')
  container.append(canvas)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 500,
    height: 300,
  } as DOMRect)
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as never)
  const listeners = new Map<string, Set<() => void>>()
  const map = {
    getContainer: () => container,
    getCanvas: () => canvas,
    stop: vi.fn(),
    resize: vi.fn(),
    triggerRepaint: vi.fn(),
    once: (name: string, callback: () => void) => {
      const set = listeners.get(name) ?? new Set()
      set.add(callback)
      listeners.set(name, set)
    },
    off: (name: string, callback: () => void) => listeners.get(name)?.delete(callback),
  }
  const emit = (name: string) => {
    const callbacks = [...(listeners.get(name) ?? [])]
    listeners.delete(name)
    for (const callback of callbacks) callback()
  }
  const restore = freezeMapForResize(map as unknown as MapLibreMap)
  expect(container.style.height).toBe('300px')
  emit('render')
  expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0)
  expect(container.querySelector('[data-map-resize-snapshot]')).not.toBeNull()
  expect(canvas.style.opacity).toBe('0')
  restore()
  expect(container.getAttribute('style')).toBe(original)
  expect(map.resize).toHaveBeenCalledTimes(1)
  expect(canvas.style.opacity).toBe('0')
  emit('render')
  expect(canvas.style.opacity).toBe('')
  expect(container.querySelector('[data-map-resize-snapshot]')).toBeNull()
  expect(listeners.get('remove')?.size ?? 0).toBe(0)
})
