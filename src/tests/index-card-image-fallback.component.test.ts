// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import IndexCardHeader from '#lib/bits/patterns/cards/indexCard/components/IndexCardHeader.svelte'

afterEach(cleanup)

describe('index card image recovery', () => {
  it('advances from a failed relative preview to its cover and identicon, and retries a changed preview', async () => {
    vi.useRealTimers()
    const view = render(IndexCardHeader, {
      imageSrc: '/api/mapRenders/projects/example/asset',
      imageFallbackSrcs: ['/cover.png', '/identicon.svg'],
      imageAlt: 'Project preview',
      imageLayout: 'cover',
    })
    const foreground = () => view.getByAltText('Project preview') as HTMLImageElement
    // Browsers expose currentSrc as an absolute URL even for a relative src attribute.
    Object.defineProperty(foreground(), 'currentSrc', { configurable: true, get() { return this.src } })
    await fireEvent.error(foreground())
    await waitFor(() => expect(foreground().getAttribute('src')).toBe('/cover.png'))
    await fireEvent.error(foreground())
    await waitFor(() => expect(foreground().getAttribute('src')).toBe('/identicon.svg'))
    await view.rerender({ imageSrc: '/api/mapRenders/projects/changed/asset' })
    await waitFor(() => expect(foreground().getAttribute('src')).toBe('/api/mapRenders/projects/changed/asset'))
  })
})
