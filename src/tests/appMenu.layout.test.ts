import { getAppMenuViewportState } from '$lib/bits/patterns/bars/appMenu/appMenu.layout'
import { describe, expect, it } from 'vitest'

describe('app menu layout', () => {
  it('uses the effective app width for layout mode selection', () => {
    const layout = getAppMenuViewportState(1280, 900, 700)

    expect(layout.hasElevatedChrome).toBe(true)
    expect(layout.isMobileMenu).toBe(true)
    expect(layout.menuMode).toBe('tallMenu')
  })

  it('falls back to viewport width when no effective width is provided', () => {
    const layout = getAppMenuViewportState(1280, 900)

    expect(layout.menuMode).toBe('widePillMenu')
  })
})
