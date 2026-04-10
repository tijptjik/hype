import { getFeatureCardLayout } from '$lib/bits/patterns/cards/featureCard/featureCard.layout'
import { getFeatureCardRootVars } from '$lib/bits/patterns/cards/featureCard/featureCard.styles'
import { shouldCollapseFeatureCardAction } from '$lib/bits/patterns/cards/featureCard/featureCard.utils'
import { describe, expect, it } from 'vitest'

describe('feature card layout', () => {
  it('uses the effective app width for responsive mode selection', () => {
    const layout = getFeatureCardLayout({
      width: 1280,
      height: 900,
      responsiveWidth: 440,
    })

    expect(layout.mode).toBe('small')
    expect(layout.hasElevatedChrome).toBe(true)
  })

  it('falls back to viewport width when no effective width is provided', () => {
    const layout = getFeatureCardLayout({
      width: 1280,
      height: 900,
    })

    expect(layout.mode).toBe('desktopWide')
  })

  it('caps rendered card width to the effective app width after gutters', () => {
    const layout = getFeatureCardLayout({
      width: 1280,
      height: 900,
      responsiveWidth: 440,
    })

    const vars = getFeatureCardRootVars({
      layout,
      horizontalOffsetPx: 0,
      availableWidthPx: 440,
    })

    expect(vars).toContain('--feature-card-max-width: 392px')
  })

  it('collapses action labels using the effective app width', () => {
    expect(shouldCollapseFeatureCardAction(440, 544)).toBe(true)
    expect(shouldCollapseFeatureCardAction(560, 544)).toBe(false)
  })
})
