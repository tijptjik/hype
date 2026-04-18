import {
  getOmnibarRootClasses,
  getOmnibarSurfaceClasses,
  getOmnibarWidthContainerClasses,
} from '$lib/bits/patterns/bars/omnibar/omnibar.styles'
import { describe, expect, it } from 'vitest'

describe('omnibar styles', () => {
  it('allows the root layout stack to shrink with the app main width', () => {
    expect(
      getOmnibarRootClasses({ hasElevatedChrome: false, effectiveAppMainWidth: 320 }),
    ).toContain('min-w-0')
    expect(getOmnibarWidthContainerClasses(false)).toContain('min-w-0')
  })

  it('keeps the floating desktop chrome without forcing a fixed surface width', () => {
    const classes = getOmnibarSurfaceClasses({
      hasElevatedChrome: true,
      effectiveAppMainWidth: 640,
    })

    expect(classes).toContain('min-w-0')
    expect(classes).not.toContain('w-120:w-[32.375rem]')
    expect(classes).toContain('rounded-full')
  })

  it('caps the floating width container against the effective app width', () => {
    const classes = getOmnibarWidthContainerClasses(true)

    expect(classes).toContain(
      'max-w-[min(32.375rem,calc(var(--omni-effective-main-width)-(var(--omni-x-gutter)*2)))]',
    )
  })

  it('drops wide-layout classes when the effective main width falls below the threshold', () => {
    const rootClasses = getOmnibarRootClasses({
      hasElevatedChrome: true,
      effectiveAppMainWidth: 479,
    })
    const surfaceClasses = getOmnibarSurfaceClasses({
      hasElevatedChrome: true,
      effectiveAppMainWidth: 479,
    })

    expect(rootClasses).toContain('mx-4')
    expect(rootClasses).not.toContain('mx-6')
    expect(surfaceClasses).not.toContain('mx-[1.75rem]')
  })
})
