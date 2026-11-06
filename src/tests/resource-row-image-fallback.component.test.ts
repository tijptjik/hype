// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ResourceRow from '#lib/bits/patterns/resource/rows/ResourceRow/ResourceRow.svelte'

beforeEach(() => {
  vi.useRealTimers()
  // jsdom does not measure row labels; browser checks exercise their real observers.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('passes the card model fallback through the row and retains it on identical updates', async () => {
  const view = render(ResourceRow, {
    index: 0,
    title: 'Mission for Migrant Workers',
    description: 'Organization description',
    imageAlt: 'Mission for Migrant Workers logo',
    imageSrc: '/missing-upload.png',
    imageFallbackSrcs: ['/identicon.svg'],
  })
  const thumbnail = view.container.querySelector('img')
  if (!thumbnail) throw new Error('Expected a row thumbnail')
  expect(thumbnail.getAttribute('src')).toBe('/missing-upload.png')
  await fireEvent.error(thumbnail)
  await waitFor(() => expect(thumbnail.getAttribute('src')).toBe('/identicon.svg'))
  await view.rerender({ imageFallbackSrcs: ['/identicon.svg'] })
  expect(view.container.querySelector('img')).toBe(thumbnail)
  expect(thumbnail.getAttribute('src')).toBe('/identicon.svg')
  await view.rerender({ imageSrc: '/replacement-upload.png' })
  await waitFor(() =>
    expect(thumbnail.getAttribute('src')).toBe('/replacement-upload.png'),
  )
})

it('advances through every fallback and removes the broken image when all sources fail', async () => {
  const view = render(ResourceRow, {
    index: 0,
    title: 'Hong Kong Ghost Signs',
    description: 'Organization description',
    imageAlt: 'Hong Kong Ghost Signs logo',
    imageSrc: '/missing-preview.png',
    imageFallbackSrcs: ['/missing-cover.png', '/identicon.svg'],
  })
  const thumbnail = view.container.querySelector('img')
  if (!thumbnail) throw new Error('Expected a row thumbnail')
  await fireEvent.error(thumbnail)
  expect(thumbnail.getAttribute('src')).toBe('/missing-cover.png')
  await fireEvent.error(thumbnail)
  expect(thumbnail.getAttribute('src')).toBe('/identicon.svg')
  await fireEvent.error(thumbnail)
  expect(view.container.querySelector('img')).toBeNull()
})
