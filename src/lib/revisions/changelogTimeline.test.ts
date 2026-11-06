// TESTS
import { expect, it } from 'vitest'
// PRESENTATION
import {
  changelogTimeBoundaries,
  changelogTimeBoundaryLabel,
  changelogCheckBoundary,
} from './changelogTimeline'

const now = new Date('2026-11-06T06:00:00.000Z')
const day = 86_400_000

/** Build ordered entries at exact elapsed ages.
 * @param ages Milliseconds before the shared current time.
 * @returns Stable record identities and immutable timestamps.
 */
function entriesAt(ages: number[]): { key: string; createdAt: string }[] {
  return ages.map((age, index) => ({
    key: `entry-${index}`,
    createdAt: new Date(now.getTime() - age).toISOString(),
  }))
}

it('places the four boundaries after newer records, once per populated group', () => {
  const entries = entriesAt([
    1,
    day - 1,
    day,
    3 * day,
    7 * day,
    20 * day,
    30 * day,
    200 * day,
    365 * day,
    800 * day,
  ])
  expect([...changelogTimeBoundaries(entries, now)]).toEqual([
    ['entry-2', 'day'],
    ['entry-4', 'week'],
    ['entry-6', 'month'],
    ['entry-8', 'year'],
  ])
})

it.each([
  ['day', day],
  ['week', 7 * day],
  ['month', 30 * day],
  ['year', 365 * day],
] as const)('crosses the %s boundary at the exact threshold', (unit, age) => {
  const entries = entriesAt([age - 1, age])
  expect(changelogTimeBoundaries(entries, now).get('entry-1')).toBe(unit)
  expect(changelogTimeBoundaries(entries.slice(0, 1), now).get('entry-0')).not.toBe(
    unit,
  )
})

it('keeps an existing boundary when a continuation adds records in the same group', () => {
  const entries = entriesAt([1000, day, 2 * day, 3 * day, 7 * day])
  expect([...changelogTimeBoundaries(entries.slice(0, 3), now)]).toEqual([
    ['entry-1', 'day'],
  ])
  expect([...changelogTimeBoundaries(entries, now)]).toEqual([
    ['entry-1', 'day'],
    ['entry-4', 'week'],
  ])
})

it('skips empty periods and handles feeds beginning with old records', () => {
  expect([...changelogTimeBoundaries(entriesAt([400 * day, 800 * day]), now)]).toEqual([
    ['entry-0', 'year'],
  ])
  expect([...changelogTimeBoundaries(entriesAt([-day, 0, 1000]), now)]).toEqual([])
  expect([...changelogTimeBoundaries([], now)]).toEqual([])
})

it('moves the boundary with the live clock and ignores invalid timestamps', () => {
  const entries = entriesAt([day - 1000])
  expect(changelogTimeBoundaries(entries, now).size).toBe(0)
  expect([...changelogTimeBoundaries(entries, new Date(now.getTime() + 1000))]).toEqual(
    [['entry-0', 'day']],
  )
  expect([
    ...changelogTimeBoundaries(
      [{ key: 'invalid', createdAt: 'invalid' }, ...entriesAt([2 * day])],
      now,
    ),
  ]).toEqual([['entry-0', 'day']])
})

it('uses the requested English labels and localizes other locales', () => {
  expect(
    ['day', 'week', 'month', 'year'].map(unit =>
      changelogTimeBoundaryLabel(unit as 'day' | 'week' | 'month' | 'year', 'en'),
    ),
  ).toEqual(['a day ago', 'a week ago', 'a month ago', 'a year ago'])
  expect(changelogTimeBoundaryLabel('day', 'zhHant')).toContain('前')
  expect(changelogTimeBoundaryLabel('year', 'zhHans')).toContain('前')
})

it('places the checked marker once between entries at or since the cutoff and older records', () => {
  const entries = entriesAt([1000, day, 2 * day, 3 * day])
  const cutoff = new Date(now.getTime() - day).toISOString()
  expect(changelogCheckBoundary(entries, cutoff, true)).toEqual({
    position: 'before',
    key: 'entry-2',
  })
  expect(changelogCheckBoundary(entries.slice(0, 2), cutoff, true)).toBeNull()
  expect(changelogCheckBoundary(entries, cutoff, false)).toEqual({
    position: 'before',
    key: 'entry-2',
  })
})

it('handles first visits, no new records, entirely new feeds, and empty feeds', () => {
  const entries = entriesAt([1000, day])
  expect(changelogCheckBoundary(entries, null, false)).toBeNull()
  expect(changelogCheckBoundary(entries, 'invalid', false)).toBeNull()
  expect(changelogCheckBoundary(entries, now.toISOString(), true)).toEqual({
    position: 'before',
    key: 'entry-0',
  })
  const old = new Date(now.getTime() - 2 * day).toISOString()
  expect(changelogCheckBoundary(entries, old, true)).toBeNull()
  expect(changelogCheckBoundary(entries, old, false)).toEqual({
    position: 'after',
    key: 'entry-1',
  })
  expect(changelogCheckBoundary([], old, false)).toEqual({ position: 'empty' })
})
