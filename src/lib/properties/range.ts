// VALIDATION
import { z } from 'zod'

export const DateResolution = z.enum(['decade', 'year', 'month', 'day'])
export const TimeMaxHour = z.union([z.literal(24), z.literal(36)])
export type RangeDefinition = {
  dataType?: string
  dateResolution?: z.infer<typeof DateResolution>
  timeMaxHour?: 24 | 36
  min?: number | null
  max?: number | null
}
export const RangeValueSchema = z
  .object({ version: z.literal(1), start: z.number().int(), end: z.number().int() })
  .strict()
  .refine(value => value.start <= value.end, 'Start must not follow end')
export type RangeValue = z.infer<typeof RangeValueSchema>
const DAY_MS = 86400000

/**
 * Identify interval contracts independently of their input widget.
 * @param definition Persisted property definition.
 * @returns Whether the value uses the versioned interval representation.
 */
export function isRangeProperty(definition: { dataType?: string }): boolean {
  return definition.dataType === 'dateRange' || definition.dataType === 'timeRange'
}

/**
 * Parse human calendar/time notation into a resolution-specific integer coordinate.
 * @param definition Property resolution and service-day limit.
 * @param input Human-readable date or HH:MM, including hours beyond midnight.
 * @returns An integer coordinate; throws for invalid or ambiguous input.
 */
export function parseRangeEndpoint(definition: RangeDefinition, input: string): number {
  if (definition.dataType === 'timeRange') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(input)
    if (!match || Number(match[2]) > 59) throw new Error('Use HH:MM')
    const minutes = Number(match[1]) * 60 + Number(match[2])
    if (minutes > (definition.timeMaxHour ?? 24) * 60)
      throw new Error('Time exceeds the service day')
    return minutes
  }
  const resolution = definition.dateResolution ?? 'day'
  if (resolution === 'year' || resolution === 'decade') {
    if (!/^\d{4}$/.test(input) || Number(input) < 1)
      throw new Error('Use a four-digit year')
    if (resolution === 'decade' && Number(input) % 10 !== 0)
      throw new Error('Use the first year of a decade')
    return resolution === 'decade' ? Number(input) / 10 : Number(input)
  }
  if (resolution === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(input)
    if (!match || Number(match[1]) < 1 || Number(match[2]) < 1 || Number(match[2]) > 12)
      throw new Error('Use YYYY-MM')
    return Number(match[1]) * 12 + Number(match[2]) - 1
  }
  const time = Date.parse(`${input}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
    input.startsWith('0000') ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== input
  )
    throw new Error('Use a valid YYYY-MM-DD date')
  return time / DAY_MS
}

/**
 * Format an interval coordinate without local-time or DST conversion.
 * @param definition Property resolution.
 * @param value Integer coordinate.
 * @returns Human-readable endpoint suitable for inputs and slider labels.
 */
export function formatRangeEndpoint(
  definition: RangeDefinition,
  value: number,
): string {
  if (definition.dataType === 'timeRange')
    return `${Math.floor(value / 60)
      .toString()
      .padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
  const resolution = definition.dateResolution ?? 'day'
  if (resolution === 'decade') return String(value * 10).padStart(4, '0')
  if (resolution === 'year') return String(value).padStart(4, '0')
  if (resolution === 'month')
    return `${Math.floor(value / 12)
      .toString()
      .padStart(4, '0')}-${((value % 12) + 1).toString().padStart(2, '0')}`
  return new Date(value * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Resolve slider bounds from explicit configuration or stable calendar defaults.
 * @param definition Property contract.
 * @returns Integer min/max, step and labelled-pip spacing.
 */
export function rangeDomain(definition: RangeDefinition): {
  min: number
  max: number
  step: number
  pipstep: number
} {
  if (definition.dataType === 'timeRange')
    return { min: 0, max: (definition.timeMaxHour ?? 24) * 60, step: 1, pipstep: 180 }
  if (definition.dataType !== 'dateRange')
    return {
      min: definition.min ?? 0,
      max: definition.max ?? 100,
      step: 1,
      pipstep: Math.max(
        1,
        Math.ceil(((definition.max ?? 100) - (definition.min ?? 0)) / 10),
      ),
    }
  const resolution = definition.dateResolution ?? 'day'
  const min =
    definition.min ??
    parseRangeEndpoint(
      definition,
      resolution === 'day' ? '1900-01-01' : resolution === 'month' ? '1900-01' : '1900',
    )
  const max =
    definition.max ??
    parseRangeEndpoint(
      definition,
      resolution === 'day' ? '2100-12-31' : resolution === 'month' ? '2100-12' : '2100',
    )
  return { min, max, step: 1, pipstep: Math.max(1, Math.ceil((max - min) / 4)) }
}

/**
 * Validate canonical interval storage against the persisted definition.
 * @param definition Persisted property configuration.
 * @param raw Versioned JSON TEXT, never inferred from a legacy scalar.
 * @returns Canonical JSON or null for an unset optional interval.
 */
export function normalizeRangeValue(
  definition: RangeDefinition,
  raw?: string | null,
): string | null {
  if (!raw?.trim()) return null
  const value = RangeValueSchema.parse(JSON.parse(raw))
  const domain = rangeDomain(definition)
  if (value.start < domain.min || value.end > domain.max)
    throw new Error('Range lies outside the configured bounds')
  for (const endpoint of [value.start, value.end]) {
    if (
      parseRangeEndpoint(definition, formatRangeEndpoint(definition, endpoint)) !==
      endpoint
    )
      throw new Error('Invalid range endpoint')
  }
  return JSON.stringify(value)
}

/**
 * Format a stored interval without exposing malformed or future-version payloads.
 * @param definition Persisted property configuration.
 * @param raw Stored JSON TEXT.
 * @returns Display text; empty for an unset range.
 */
export function rangeText(definition: RangeDefinition, raw?: string | null): string {
  try {
    const normalized = normalizeRangeValue(definition, raw)
    if (!normalized) return ''
    const value = RangeValueSchema.parse(JSON.parse(normalized))
    // Keep machine-readable endpoints for inputs; use calendar labels only for display.
    /**
     * Format one calendar endpoint for display without changing stored values.
     * @param endpoint Numeric endpoint in the configured resolution.
     * @returns Human-readable date or time.
     */
    const displayEndpoint = (endpoint: number): string => {
      const formatted = formatRangeEndpoint(definition, endpoint)
      if (definition.dataType !== 'dateRange') return formatted
      const resolution = definition.dateResolution ?? 'day'
      if (resolution === 'decade') return `${formatted}s`
      if (resolution === 'year') return formatted
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ]
      const [year, month, day] = formatted.split('-')
      const monthLabel = months[Number(month) - 1]
      return resolution === 'month'
        ? `'${year.slice(-2)}-${monthLabel.toUpperCase()}`
        : `${Number(day)} ${monthLabel} ${year}`
    }
    const start = displayEndpoint(value.start)
    const end = displayEndpoint(value.end)
    return value.start === value.end ? start : `${start} – ${end}`
  } catch {
    return 'This value requires a newer editor'
  }
}

/** Format a stored ISO date for display without changing its editing value.
 * @param value ISO calendar date, or an empty value.
 * @returns Day, abbreviated month and full year; preserves invalid legacy text.
 */
export function singleDateText(value: string): string {
  if (!value) return ''
  try {
    const definition = { dataType: 'dateRange', dateResolution: 'day' as const }
    const endpoint = parseRangeEndpoint(definition, value)
    return rangeText(
      { ...definition, min: endpoint, max: endpoint },
      JSON.stringify({ version: 1, start: endpoint, end: endpoint }),
    )
  } catch {
    return value
  }
}
