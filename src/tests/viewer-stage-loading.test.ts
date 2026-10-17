// @vitest-environment jsdom
// SVELTE
import { flushSync } from 'svelte'
import { cleanup, render } from '@testing-library/svelte/pure'
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
// COMPONENTS
import ViewerStage from '#lib/bits/patterns/images/components/ViewerStage.svelte'

afterEach(cleanup)

it('hides the first image until decode and retains it while the next image loads', async () => {
  const view = render(ViewerStage, {
    currentItem: { id: 'first', src: '/first.jpg' },
    activeId: 'first',
    fit: 'cover',
  })
  flushSync()
  const preload = view.container.querySelector('img')!
  const decoded = Promise.withResolvers<void>()
  Object.defineProperty(preload, 'decode', { value: () => decoded.promise })
  expect(view.container.querySelector('[data-image-skeleton]')).not.toBeNull()
  expect(view.container.querySelector('.viewer-scene')).toBeNull()
  preload.dispatchEvent(new Event('load'))
  expect(view.container.querySelector('.viewer-scene')).toBeNull()
  decoded.resolve()
  await vi.advanceTimersByTimeAsync(300)
  flushSync()
  expect(view.container.querySelector('[data-image-skeleton]')).toBeNull()
  expect(view.container.querySelector('.viewer-scene img')?.getAttribute('src')).toBe(
    '/first.jpg',
  )

  const rerender = view.rerender({
    currentItem: { id: 'second', src: '/second.jpg' },
    activeId: 'second',
    fit: 'cover',
  })
  await vi.advanceTimersByTimeAsync(0)
  await rerender
  flushSync()
  expect(view.container.querySelector('[data-image-skeleton]')).toBeNull()
  expect(view.container.querySelector('.viewer-scene img')?.getAttribute('src')).toBe(
    '/first.jpg',
  )
  const nextPreload = view.container.querySelector('img[src="/second.jpg"]')!
  nextPreload.dispatchEvent(new Event('load'))
  await vi.advanceTimersByTimeAsync(300)
  flushSync()
  expect(view.container.querySelector('.viewer-scene img')?.getAttribute('src')).toBe(
    '/second.jpg',
  )
})
