import { getAppMenuNavStyles } from '$lib/bits/patterns/bars/appMenu/appMenu.styles'
import { describe, expect, it } from 'vitest'

describe('app menu styles', () => {
  it('caps the desktop menu against the effective app width and panel offset', () => {
    const styles = getAppMenuNavStyles({
      itemCount: 4,
      offsetX: 180,
      effectiveWidthPx: 700,
      xGutterPx: 16,
      bottomGutterPx: 16,
    })

    expect(styles).toContain('--app-menu-offset-x: 180px')
    expect(styles).toContain('--app-menu-effective-width: 700px')
    expect(styles).toContain('--app-menu-x-gutter: 16px')
  })
})
