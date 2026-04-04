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

  it('drops wide-layout classes when the effective main width falls below the threshold', () => {
    const rootClasses = getOmnibarRootClasses({
      hasElevatedChrome: true,
      effectiveAppMainWidth: 479,
    })
    const surfaceClasses = getOmnibarSurfaceClasses({
      hasElevatedChrome: true,
      effectiveAppMainWidth: 479,
    })

    expect(rootClasses).toContain('mx-6')
    expect(rootClasses).not.toContain('mx-4')
    expect(surfaceClasses).not.toContain('mx-[1.75rem]')
  })
})
