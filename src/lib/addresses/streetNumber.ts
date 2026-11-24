export type StreetNumberError = 'format' | 'descending'
export type StreetNumber = {
  expression: string
  from: string | null
  to: string | null
  connector: '-' | '/' | '&' | null
}
export type StreetNumberParse =
  | { valid: true; number: StreetNumber }
  | { valid: false; error: StreetNumberError }

/** Parse one street number, a range, or a pair without expanding address membership.
 * @param input User-entered number expression.
 * @returns Canonical expression and endpoints, or a format/order error.
 * @remarks A hyphen denotes a range; commas and ampersands denote a pair. Only
 * suffixes with the same numeric base are shortened, and no missing digits are inferred.
 */
export function parseStreetNumber(input: string): StreetNumberParse {
  const value = input.normalize('NFKC').trim().toUpperCase().replace(/[–—−]/g, '-')
  if (!value)
    return {
      valid: true,
      number: { expression: '', from: null, to: null, connector: null },
    }
  // A hyphen before a lone suffix is a single number, rather than an incomplete range.
  const single = /^(\d+)\s*([A-Z]?)$/.exec(
    value.replace(/^(\d+)\s*-\s*([A-Z])$/, '$1$2'),
  )
  if (single) {
    const from = single[1] + single[2]
    return {
      valid: true,
      number: { expression: from, from, to: null, connector: null },
    }
  }
  const pair =
    /^(\d+\s*[A-Z]?)\s*(-|TO|至|,|、|&|AND|及|與|和|\/)\s*(\d+\s*[A-Z]?|[A-Z])$/.exec(
      value,
    )
  if (!pair) return { valid: false, error: 'format' }
  const from = pair[1].replace(/\s/g, '')
  const base = /^\d+/.exec(from)![0]
  const to = /^[A-Z]$/.test(pair[3]) ? base + pair[3] : pair[3].replace(/\s/g, '')
  const endBase = /^\d+/.exec(to)![0]
  const suffix = from.slice(base.length),
    endSuffix = to.slice(endBase.length)
  if (
    BigInt(endBase) < BigInt(base) ||
    (BigInt(endBase) === BigInt(base) && endSuffix < suffix)
  )
    return { valid: false, error: 'descending' }
  const connector = ['-', 'TO', '至'].includes(pair[2])
    ? '-'
    : pair[2] === '/' || (base === endBase && suffix && endSuffix)
      ? '/'
      : '&'
  const end =
    connector === '/' && base === endBase && suffix && endSuffix ? endSuffix : to
  const expression =
    connector === '&' ? `${from} & ${end}` : `${from}${connector}${end}`
  return { valid: true, number: { expression, from, to, connector } }
}

const numberCollator = new Intl.Collator('en', { numeric: true })

/** Compare address choices by range first, then by their numeric endpoints and suffixes.
 * @param left First street-number expression.
 * @param right Second street-number expression.
 * @returns Sort order, with missing or unrecognized numbers tied at the end.
 */
export function compareStreetNumbers(left: string, right: string): number {
  const a = parseStreetNumber(left)
  const b = parseStreetNumber(right)
  if (!a.valid || !a.number.from) return b.valid && b.number.from ? 1 : 0
  if (!b.valid || !b.number.from) return -1
  return (
    Number(b.number.connector === '-') - Number(a.number.connector === '-') ||
    numberCollator.compare(a.number.from, b.number.from) ||
    numberCollator.compare(a.number.to ?? '', b.number.to ?? '')
  )
}

/** Format recognized number syntax while leaving retained, unrecognized evidence intact.
 * @param expression Existing expression. @param from Structured first endpoint.
 * @param to Structured last endpoint. @param connector Range or pair separator.
 * @returns Canonical display text, or the original evidence when parsing is unsafe.
 */
export function formatStreetNumber(
  expression: string,
  from = '',
  to = '',
  connector = '-',
): string {
  const raw = expression || [from, to].filter(Boolean).join(connector || '-')
  const parsed = parseStreetNumber(raw)
  return parsed.valid ? parsed.number.expression : raw
}

/** Validate explicit number corrections or authored fields without interpreting source names.
 * @param fields Number expression and optional scalar endpoints.
 * @returns A format/order error, or null when the number is valid or absent.
 */
export function streetNumberIssue(
  fields: Record<string, unknown>,
): StreetNumberError | null {
  const text = (key: string): string =>
    typeof fields[key] === 'string' ? (fields[key] as string) : ''
  const expression = text('buildingNumberExpression')
  if (expression) {
    const parsed = parseStreetNumber(expression)
    if (!parsed.valid) return parsed.error
  }
  const from = text('buildingNumberFrom'),
    to = text('buildingNumberTo')
  if (from || to) {
    if (!from) return 'format'
    const parsed = parseStreetNumber(
      [from, to].filter(Boolean).join(text('buildingNumberConnector') || '-'),
    )
    if (!parsed.valid) return parsed.error
  }
  return null
}
