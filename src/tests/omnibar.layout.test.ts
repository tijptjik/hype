import {
  getElevatedChromeXGutter,
  getOmnibarClearanceHeight,
  getOmnibarTopGutter,
} from '$lib/bits/patterns/bars/omnibar/Omnibar.layout'
import { describe, expect, it } from 'vitest'

describe('omnibar layout', () => {
  it('uses the effective app width for gutter selection', () => {
    expect(getElevatedChromeXGutter(700)).toBe(16)
    expect(getOmnibarTopGutter(1400, 1300, 700)).toBe(16)
    expect(getOmnibarClearanceHeight(1400, 1300, 700)).toBe(88)
  })

  it('drops back to docked omnibar chrome when effective width is narrow', () => {
    expect(getOmnibarTopGutter(1400, 900, 360)).toBe(16)
    expect(getOmnibarClearanceHeight(1400, 900, 360)).toBe(56)
  })

  it('falls back to viewport width when no effective width is provided', () => {
    expect(getOmnibarTopGutter(1400, 1300)).toBe(48)
    expect(getOmnibarClearanceHeight(1400, 1300)).toBe(128)
  })
})
