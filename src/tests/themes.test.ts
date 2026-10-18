import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { THEMES, isThemeId, resolveTheme } from '../lib/themes/themes'

describe('hub theme defaults', () => {
  it('uses Nullspace for other hubs and Milque for Breadline', () => {
    expect(resolveTheme(undefined, 'hype.hk')).toBe('hype-black')
    expect(resolveTheme(undefined, 'breadline.hk')).toBe('breadline-light')
    expect(resolveTheme(undefined, 'WWW.BREADLINE.HK:443')).toBe('breadline-light')
    expect(resolveTheme(undefined, 'breadline.hk.example.com')).toBe('hype-black')
  })
  it('honours each explicit selection and rejects unknown cookie values', () => {
    for (const theme of THEMES) {
      expect(resolveTheme(theme.id, 'breadline.hk')).toBe(theme.id)
      expect(isThemeId(theme.id)).toBe(true)
    }
    expect(resolveTheme('<script>', 'breadline.hk')).toBe('breadline-light')
    expect(isThemeId(null)).toBe(false)
  })
})

/** Converts a hex palette token to WCAG relative luminance. */
function luminance(hex: string): number {
  const rgb = hex.match(/[\da-f]{2}/gi)?.map(value => {
    const channel = parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  if (!rgb || rgb.length !== 3) throw new Error(`Invalid palette color: ${hex}`)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

it('keeps text and button labels at WCAG AA contrast in every palette', () => {
  const css = readFileSync('src/lib/styles/themes.css', 'utf8')
  for (const theme of THEMES) {
    const block = css.split(`[data-theme="${theme.id}"] {`)[1].split('}')[0]
    const tokens = Object.fromEntries(
      [...block.matchAll(/--theme-([\w-]+):\s*(#[\da-f]{6})/gi)].map(match => [
        match[1],
        match[2],
      ]),
    )
    for (const [foreground, background] of [
      ['text', 'canvas'],
      ['text', 'panel'],
      ['muted', 'panel'],
      ['primary', 'panel'],
      ['secondary', 'panel'],
      ['tertiary', 'panel'],
      ['on-primary', 'primary'],
      ['on-secondary', 'secondary'],
      ['on-tertiary', 'tertiary'],
    ]) {
      const a = luminance(tokens[foreground]),
        b = luminance(tokens[background])
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        `${theme.id}: ${foreground}/${background}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  }
})
