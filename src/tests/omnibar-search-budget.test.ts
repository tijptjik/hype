import { describe, expect, it } from 'vitest'
import {
  allocateSearchRows,
  getSearchTrayHeight,
  OMNIBAR_SEARCH_POLICY,
} from '#lib/bits/patterns/bars/omnibar/searchBudget.js'

describe('shared Omni Search budget', () => {
  it('caps at sixty percent of the visual viewport and the actual space below the input', () => {
    expect(getSearchTrayHeight(800, 700)).toBe(480)
    expect(getSearchTrayHeight(300, 240)).toBe(180)
    expect(getSearchTrayHeight(300, 100)).toBe(100)
    expect(getSearchTrayHeight(300, -20)).toBe(0)
  })

  it('allocates quotas in priority order, charging headers as well as rows', () => {
    expect(OMNIBAR_SEARCH_POLICY.map(policy => policy.type)).toEqual([
      'feature',
      'walk',
      'project',
      'layer',
      'neighbourhood',
      'organisation',
    ])
    const sections = OMNIBAR_SEARCH_POLICY.map(policy => ({
      chrome: 48,
      rows: Array(policy.limit).fill(36),
    }))
    expect(allocateSearchRows(sections, 432)).toEqual([5, 2, 1, 0, 0, 0])
    expect(allocateSearchRows(sections, 132)).toEqual([2, 0, 0, 0, 0, 0])
  })

  it('never leaves an orphan header and treats wrapped rows by measured height', () => {
    expect(
      allocateSearchRows(
        [
          { chrome: 48, rows: [72, 72] },
          { chrome: 48, rows: [36] },
        ],
        220,
      ),
    ).toEqual([2, 0])
    expect(allocateSearchRows([{ chrome: 48, rows: [72, 72] }], 121)).toEqual([1])
  })

  it('skips empty categories and permits just the first oversized result to scroll', () => {
    expect(
      allocateSearchRows(
        [
          { chrome: 48, rows: [] },
          { chrome: 48, rows: [200, 36] },
        ],
        100,
      ),
    ).toEqual([0, 1])
    expect(allocateSearchRows([{ chrome: 48, rows: [36] }], 0)).toEqual([0])
  })
})
