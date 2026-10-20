import { describe, expect, it } from 'vitest'
import {
  DateResolution,
  formatRangeEndpoint,
  normalizeRangeValue,
  parseRangeEndpoint,
  rangeDomain,
  rangeText,
  singleDateText,
  type RangeDefinition,
} from '#lib/properties/range.js'
import { PropertyRecordCreate } from '#lib/db/zod/schema/property.js'

const time: RangeDefinition = { dataType: 'timeRange' }
const encode = (start: number, end: number, version = 1) =>
  JSON.stringify({ version, start, end })
describe('temporal property contracts', () => {
  it.each([
    ['decade', '1990', '2020'],
    ['year', '1999', '2024'],
    ['month', '2024-02', '2024-12'],
    ['day', '2024-02-29', '2024-03-01'],
  ] as const)(
    'round trips %s buckets independently of timezones',
    (dateResolution, from, to) => {
      const definition = { dataType: 'dateRange', dateResolution }
      const start = parseRangeEndpoint(definition, from)
      const end = parseRangeEndpoint(definition, to)
      expect(formatRangeEndpoint(definition, start)).toBe(from)
      expect(formatRangeEndpoint(definition, end)).toBe(to)
      expect(normalizeRangeValue(definition, encode(start, end))).toBe(
        encode(start, end),
      )
      expect(rangeText(definition, encode(start, end))).toContain(
        { decade: '1990s', year: '1999', month: "'24-FEB", day: '29 Feb 2024' }[
          dateResolution
        ],
      )
    },
  )
  it('displays month and day ranges using readable calendar labels', () => {
    const day: RangeDefinition = { dataType: 'dateRange', dateResolution: 'day' }
    expect(
      rangeText(
        day,
        encode(
          parseRangeEndpoint(day, '2027-11-10'),
          parseRangeEndpoint(day, '2027-11-16'),
        ),
      ),
    ).toBe('10 Nov 2027 – 16 Nov 2027')
    const month: RangeDefinition = { dataType: 'dateRange', dateResolution: 'month' }
    expect(
      rangeText(
        month,
        encode(
          parseRangeEndpoint(month, '2026-01'),
          parseRangeEndpoint(month, '2026-10'),
        ),
      ),
    ).toBe("'26-JAN – '26-OCT")
  })
  it('enforces leap dates, calendar resolution, ordering and versions', () => {
    expect(() => parseRangeEndpoint({ dataType: 'dateRange' }, '2023-02-29')).toThrow()
    expect(() =>
      parseRangeEndpoint({ dataType: 'dateRange', dateResolution: 'month' }, '2024-13'),
    ).toThrow()
    expect(() =>
      parseRangeEndpoint({ dataType: 'dateRange', dateResolution: 'decade' }, '1995'),
    ).toThrow()
    expect(() => normalizeRangeValue(time, encode(500, 400))).toThrow()
    expect(() => normalizeRangeValue(time, encode(400.5, 500))).toThrow()
    expect(() => normalizeRangeValue(time, encode(400, 500, 2))).toThrow()
    expect(rangeText(time, encode(400, 500, 2))).toContain('newer editor')
    expect(normalizeRangeValue(time, '')).toBeNull()
  })
  it('defaults to 24:00 and explicitly supports through 36:00 without wrapping', () => {
    expect(rangeDomain(time).max).toBe(1440)
    expect(parseRangeEndpoint(time, '24:00')).toBe(1440)
    expect(() => parseRangeEndpoint(time, '24:01')).toThrow()
    const extended = { ...time, timeMaxHour: 36 as const }
    expect(parseRangeEndpoint(extended, '25:30')).toBe(1530)
    expect(parseRangeEndpoint(extended, '36:00')).toBe(2160)
    expect(() => parseRangeEndpoint(extended, '36:01')).toThrow()
    expect(() => parseRangeEndpoint(extended, '23:60')).toThrow()
    expect(rangeText(extended, encode(1380, 1530))).toBe('23:00 – 25:30')
  })
  it('validates range definitions and rejects incompatible widgets and bounds', () => {
    const definition = {
      key: 'dates',
      type: 'specifier',
      component: 'DateRangeField',
      dataType: 'dateRange',
      isTranslatable: false,
      cardinality: 'one',
      presentation: 'text',
    }
    for (const dateResolution of DateResolution.options)
      expect(
        PropertyRecordCreate.safeParse({ ...definition, dateResolution }).success,
      ).toBe(true)
    expect(
      PropertyRecordCreate.safeParse({ ...definition, cardinality: 'many' }).success,
    ).toBe(false)
    expect(
      PropertyRecordCreate.safeParse({ ...definition, component: 'InputField' })
        .success,
    ).toBe(false)
    expect(
      PropertyRecordCreate.safeParse({ ...definition, min: 20, max: 10 }).success,
    ).toBe(false)
    expect(
      PropertyRecordCreate.safeParse({
        ...definition,
        dateResolution: 'year',
        min: 2024,
        max: 99999,
      }).success,
    ).toBe(false)
  })
})

it('formats single dates for display while retaining invalid legacy values', () => {
  expect(singleDateText('2023-10-10')).toBe('10 Oct 2023')
  expect(singleDateText('2024-02-29')).toBe('29 Feb 2024')
  expect(singleDateText('')).toBe('')
  expect(singleDateText('invalid')).toBe('invalid')
})
