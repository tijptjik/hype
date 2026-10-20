// TESTING
import { describe, expect, it, vi } from 'vitest'
// LOCAL
import {
  resolveFeaturePropertyLayout,
  fitFeaturePropertyLayoutInRegion,
} from '#lib/bits/patterns/cards/featureCard/featureCard.layout.js'

// Deterministic font metrics exercise packing without depending on a system font.
vi.mock('@chenglou/pretext', () => ({
  prepare: (text: string) => text,
  measureNaturalWidth: (text: string) => text.length * 8,
  layout: (text: string, width: number, lineHeight: number) => {
    let lines = 1
    let lineWidth = 0
    for (const word of text.split(/\s+/)) {
      const wordWidth = word.length * 8
      if (lineWidth && lineWidth + 8 + wordWidth > width) {
        lines++
        lineWidth = 0
      }
      lines += Math.max(0, Math.ceil(wordWidth / Math.max(width, 1)) - 1)
      lineWidth = lineWidth ? lineWidth + 8 + wordWidth : wordWidth
    }
    return { lineCount: lines, height: lines * lineHeight }
  },
}))

const items = [
  { id: 'country', label: 'Country', value: 'Hungary' },
  { id: 'author', label: 'Author', value: 'László Krasznahorkai' },
  { id: 'performer', label: 'Performer', value: 'Vulgo' },
  {
    id: 'awards',
    label: 'Awards',
    value: 'International Booker Prize 2024 (with translator Michael Hofmann)',
  },
]

describe('property grid packing', () => {
  it.each([72, 180, 350, 520, 960])(
    'fits %ipx without overflow or reordering',
    width => {
      const result = resolveFeaturePropertyLayout(items, width, 12)
      expect(result.totalWidth).toBeLessThanOrEqual(width + 0.5)
      expect(result.cells.map(cell => cell.id)).toEqual(items.map(item => item.id))
      const occupied = new Set<string>()
      for (const cell of result.cells) {
        expect(cell.column + cell.colSpan).toBeLessThanOrEqual(result.columns)
        for (let column = cell.column; column < cell.column + cell.colSpan; column++) {
          const slot = `${cell.row}:${column}`
          expect(occupied.has(slot)).toBe(false)
          occupied.add(slot)
        }
      }
    },
  )

  it('budgets extra row height for wrapped labels', () => {
    const short = resolveFeaturePropertyLayout(
      [{ id: 'a', label: 'Date', value: '2024' }],
      100,
      12,
    )
    const long = resolveFeaturePropertyLayout(
      [{ id: 'a', label: 'Publication date cover edition', value: '2024' }],
      100,
      12,
    )
    expect(long.totalHeight).toBeGreaterThan(short.totalHeight)
  })

  it('keeps a long name on one line when the available width permits it', () => {
    const result = resolveFeaturePropertyLayout(items.slice(0, 3), 700, 12)
    expect(result.cells.find(cell => cell.id === 'author')?.valueLineCount).toBe(1)
  })
})

it('reserves content height rather than the maximum scroll height for a short link', () => {
  const result = resolveFeaturePropertyLayout(
    [
      {
        id: 'source',
        label: 'Source',
        value: 'Bookshop ↗',
        display: {
          kind: 'links',
          numbered: false,
          links: [{ id: 'one', url: 'https://example.org', label: 'Bookshop' }],
        },
      },
    ],
    350,
    12,
  )
  expect(result.totalHeight).toBe(62)
})

it('keeps the four ghost-sign fields beside the portal at fractional viewport widths', () => {
  const fields = [
    { id: 'collection', label: 'Collection', value: 'Public' },
    { id: 'condition', label: 'Condition', value: 'Outline / Imprint Only' },
    { id: 'size', label: 'Size', value: 'Medium' },
    { id: 'characters', label: 'Characters', value: '循道衛理聯會教會-信望堂' },
  ]
  for (let width = 500; width < 800; width += 0.7) {
    const fit = fitFeaturePropertyLayoutInRegion(fields, width, 196, 4, 12)
    expect(fit.fitCount, `width ${width}`).toBe(4)
  }
})

it('keeps short property columns compact instead of distributing spare width', () => {
  const result = resolveFeaturePropertyLayout(
    [
      { id: 'collection', label: 'Collection', value: 'Public' },
      { id: 'size', label: 'Size', value: 'Medium' },
    ],
    750,
    12,
  )
  expect(result.totalWidth).toBeLessThan(300)
})
