// VALIDATION
import { z } from 'zod'
import { normalizeRangeValue, rangeText, type RangeDefinition } from './range'

/** Supported contracts; legacy classifier and phone storage remain unchanged. */
export const PropertyDataType = z.enum([
  'text',
  'number',
  'date',
  'boolean',
  'link',
  'dateRange',
  'timeRange',
])
export const PropertyCardinality = z.enum(['one', 'many'])
export const PropertyPresentation = z.enum([
  'text',
  'labelledLinks',
  'numberedReferences',
])
export const PropertyAudience = z.enum(['public', 'internal'])
export const LINK_LIMIT = 16

const localeLabels = z
  .object({
    en: z.string().trim().max(256).optional(),
    zhHans: z.string().trim().max(256).optional(),
    zhHant: z.string().trim().max(256).optional(),
  })
  .strict()
  .refine(
    labels => Object.values(labels).some(label => Boolean(label?.trim())),
    'Anchor text is required',
  )

/** URL validation deliberately does not fetch the destination. */
export const LinkUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(value => {
    try {
      const url = new URL(value)
      return (
        /^https?:$/.test(url.protocol) &&
        !url.username &&
        !url.password &&
        !Array.from(value).some(
          character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        )
      )
    } catch {
      return false
    }
  }, 'Use an absolute HTTP or HTTPS URL without credentials')

export const LinkItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),
    url: LinkUrl,
    label: localeLabels,
  })
  .strict()
export const LinkValueSchema = z
  .object({
    version: z.literal(1),
    items: z.array(LinkItemSchema).max(LINK_LIMIT),
  })
  .strict()
  .refine(
    value => new Set(value.items.map(item => item.id)).size === value.items.length,
    'Link IDs must be unique',
  )
export type LinkItem = z.infer<typeof LinkItemSchema>
export type LinkValue = z.infer<typeof LinkValueSchema>
export type PropertyValueDefinition = RangeDefinition & {
  dataType?: z.infer<typeof PropertyDataType>
  cardinality?: z.infer<typeof PropertyCardinality>
  presentation?: z.infer<typeof PropertyPresentation>
  audience?: z.infer<typeof PropertyAudience>
}
export type PropertyDisplay =
  | { kind: 'text'; text: string }
  | { kind: 'phones'; text: string; numbers: Array<{ text: string; href: string }> }
  | {
      kind: 'links'
      links: Array<{ id: string; url: string; label: string }>
      numbered: boolean
    }
  | { kind: 'unavailable'; text: string }

/**
 * Validate and normalize the explicit structured storage representation.
 * @param definition Persisted property contract, never caller-supplied metadata.
 * @param raw Serialized JSON from the form or database.
 * @returns Canonical JSON, or null for an empty optional value.
 */
export function normalizeLinkValue(
  definition: PropertyValueDefinition,
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null
  const parsed = LinkValueSchema.parse(JSON.parse(raw))
  if (definition.cardinality !== 'many' && parsed.items.length > 1)
    throw new Error('This property accepts one link')
  return parsed.items.length ? JSON.stringify(parsed) : null
}

/**
 * Select an anchor label without translating or modifying its URL.
 * @param item Link with locale-keyed plain-text labels.
 * @param locales Preferred locale keys in fallback order.
 * @returns The first available non-empty label.
 */
export function linkLabel(item: LinkItem, locales: string[]): string {
  for (const locale of [...locales, 'en', 'zhHant', 'zhHans']) {
    const label = item.label[locale as keyof LinkItem['label']]
    if (label) return label
  }
  return ''
}

/**
 * Decode a structured value for a typed renderer; unsupported versions stay intact.
 * @param definition Property contract.
 * @param raw Serialized stored value.
 * @param locales Ordered label preferences.
 * @returns Safe links or a controlled unavailable state, never executable HTML.
 */
export function displayLinkValue(
  definition: PropertyValueDefinition,
  raw: string | null | undefined,
  locales: string[],
): PropertyDisplay {
  try {
    const normalized = normalizeLinkValue(definition, raw)
    const value = normalized
      ? LinkValueSchema.parse(JSON.parse(normalized))
      : { items: [] }
    return {
      kind: 'links',
      numbered: definition.presentation === 'numberedReferences',
      links: value.items.map(item => ({
        id: item.id,
        url: item.url,
        label: linkLabel(item, locales),
      })),
    }
  } catch {
    return { kind: 'unavailable', text: 'This value requires a newer editor' }
  }
}

/**
 * Validate scalar values without interpreting legacy text as JSON.
 * @param type Explicit data type.
 * @param raw Optional scalar string.
 * @returns The validated scalar string or null.
 */
function normalizeScalar(type: string, raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null
  if (type === 'number' && (!raw.trim() || !Number.isFinite(Number(raw))))
    throw new Error('Enter a finite number')
  if (type === 'boolean' && raw !== 'true' && raw !== 'false')
    throw new Error('Enter true or false')
  if (
    type === 'date' &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
      Number.isNaN(Date.parse(raw)) ||
      new Date(raw).toISOString().slice(0, 10) !== raw)
  )
    throw new Error('Enter a valid date (YYYY-MM-DD)')
  return raw
}

/** Server-owned value registry; widgets and display strings do not determine types. */
export const propertyValueRegistry = {
  dateRange: { normalize: normalizeRangeValue, display: rangeText, editor: 'range' },
  timeRange: { normalize: normalizeRangeValue, display: rangeText, editor: 'range' },
  text: {
    normalize: (value: string | null | undefined) => normalizeScalar('text', value),
    editor: 'text',
  },
  number: {
    normalize: (value: string | null | undefined) => normalizeScalar('number', value),
    editor: 'number',
  },
  boolean: {
    normalize: (value: string | null | undefined) => normalizeScalar('boolean', value),
    editor: 'boolean',
  },
  date: {
    normalize: (value: string | null | undefined) => normalizeScalar('date', value),
    editor: 'date',
  },
  link: { normalize: normalizeLinkValue, display: displayLinkValue, editor: 'links' },
} as const
