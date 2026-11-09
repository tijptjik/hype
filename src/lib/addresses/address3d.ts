// Shared semantic floor/unit codes, parsers and formatting; local Feature details have no inventory ID.
export * from '@saanseoi/address/units'

import {
  formatFloor as sharedFormatFloor,
  formatUnit as sharedFormatUnit,
  parseFloor as sharedParseFloor,
  parseUnit as sharedParseUnit,
  floorTerms,
  unitTerms,
  type FloorType,
  type UnitType,
  type UnitDetails,
  type LocaleKey,
} from '@saanseoi/address/units'
import { addressAbbreviations } from './formatting.js'

/** Extract a recognized floor term from a reference without overriding a selected type for bare numbers.
 * @param expression Reference-field input. @param selectedType Current selector value.
 * @returns Clean reference, resolved type and whether a recognized term was extracted.
 */
export function parseFloorReference(
  expression: string,
  selectedType: FloorType,
): { floorRef: string; floorType: FloorType; extracted: boolean } {
  const raw = expression.trim()
  const named = Object.entries(floorTerms).find(([code, terms]) =>
    [code, ...terms].some(term => term.toLocaleLowerCase() === raw.toLocaleLowerCase()),
  )
  if (raw && named)
    return { floorRef: '', floorType: named[0] as FloorType, extracted: true }
  const compact = /^(UG|LG|B|M|C|P|R|G|F)\s*(\d[\w-]*)$/i.exec(raw)
  if (compact)
    return {
      floorRef: compact[2],
      floorType: compact[1].toUpperCase() as FloorType,
      extracted: true,
    }
  const inferred = sharedParseFloor(raw)
  const extracted = Boolean(
    raw &&
      inferred.floorType !== 'X' &&
      (inferred.floorRef ?? '').toLocaleLowerCase() !== raw.toLocaleLowerCase(),
  )
  const parsed = extracted ? inferred : sharedParseFloor(raw, selectedType)
  return {
    floorRef: parsed.floorRef ?? '',
    floorType: parsed.floorType ?? selectedType,
    extracted,
  }
}

/** Infer a pasted unit type while preserving the selected type for bare references.
 * @param expression Reference entry. @param selectedType Current type.
 * @returns Clean reference and inferred type, plus whether a term was removed.
 */
export function parseUnitReference(
  expression: string,
  selectedType: UnitType,
): { unitRef: string; unitType: UnitType; extracted: boolean } {
  const raw = expression.trim()
  const named = Object.entries(unitTerms).find(
    ([code, terms]) =>
      code !== 'X' && terms.some(term => term.toLowerCase() === raw.toLowerCase()),
  )
  if (raw && named)
    return { unitRef: '', unitType: named[0] as UnitType, extracted: true }
  const inferred = parseUnit(raw)
  const extracted = Boolean(
    raw &&
      inferred.unitType &&
      inferred.unitType !== 'X' &&
      (inferred.unitRef ?? '') !== raw,
  )
  return {
    unitRef: extracted ? (inferred.unitRef ?? '') : raw,
    unitType: extracted ? inferred.unitType! : selectedType,
    extracted,
  }
}

/** Format site-style English floor labels without appending /F to named levels.
 * @param details Parsed floor semantics. @param locale Display language.
 * @returns G/F and numbered floors retain /F; UG, LG, B, M, C, P and R do not.
 */
export function formatFloor(
  ...[details, locale]: Parameters<typeof sharedFormatFloor>
): string {
  const formatted = sharedFormatFloor(details, locale)
  return locale === 'en' &&
    details.floorType &&
    !['F', 'G', 'X'].includes(details.floorType)
    ? formatted.replace(/\/F$/, '')
    : formatted
}

/** Remove recognized repeated unit type labels while preserving identifiers and unknown expressions.
 * @param expression User input. @param type Explicit selector value, which takes precedence.
 * @returns Parsed unit reference and semantic type.
 */
export function parseUnit(
  expression: string,
  type?: UnitType,
): ReturnType<typeof sharedParseUnit> {
  if (type === 'X') return sharedParseUnit(expression, type)
  let remaining = expression.trim()
  let inferred: UnitType | undefined = type
  // A repeated prefix/suffix may come from pasting a complete unit expression into the reference field.
  for (let count = 0; count < 20; count++) {
    const expanded = Object.values(unitTerms).reduce((value, terms) => {
      const term = terms[0]
      const abbreviation =
        addressAbbreviations[term as keyof typeof addressAbbreviations]
      return abbreviation && abbreviation !== term
        ? value.replace(new RegExp(`^${abbreviation}\\.?\\s+`, 'i'), `${term} `)
        : value
    }, remaining)
    const chinese = Object.entries(unitTerms)
      .filter(([code]) => code !== 'X')
      .flatMap(([code, terms]) =>
        terms.slice(1).map(term => ({ code: code as UnitType, term })),
      )
      .sort((a, b) => b.term.length - a.term.length)
      .find(({ term }) => expanded.length > term.length && expanded.endsWith(term))
    const parsed: ReturnType<typeof sharedParseUnit> = chinese
      ? {
          unitRef: expanded.slice(0, -chinese.term.length),
          unitType: inferred ?? chinese.code,
        }
      : sharedParseUnit(expanded, inferred)
    if (parsed.unitRef === expanded || !parsed.unitRef) return parsed
    inferred ??= parsed.unitType ?? undefined
    remaining = parsed.unitRef
  }
  return sharedParseUnit(remaining, inferred)
}

/** Format display units with HYPE's canonical English abbreviations and localized ordering.
 * @param details Parsed unit semantics. @param locale Display language.
 * @returns Abbreviated display expression, such as Rm 3308; type selectors keep their full labels.
 */
export function formatUnit(details: UnitDetails, locale: LocaleKey): string {
  const formatted = sharedFormatUnit(details, locale)
  if (locale !== 'en' || !details.unitType || details.unitType === 'X') return formatted
  const term = unitTerms[details.unitType][0]
  const abbreviation =
    addressAbbreviations[term as keyof typeof addressAbbreviations] ?? term
  return formatted.replace(new RegExp(`^${term}\\s+`), `${abbreviation} `)
}

/** Canonicalize a recognized source unit expression for display without guessing a type for bare identifiers.
 * @param expression Source expression. @param locale Display language.
 * @returns Canonical display expression or unchanged unrecognized text.
 */
export function unitDisplayExpression(expression: string, locale: LocaleKey): string {
  return (locale === 'en' ? expression.split(',') : [expression])
    .map(part => {
      const parsed = parseUnit(part)
      return parsed.unitRef && parsed.unitRef !== part.trim()
        ? formatUnit(parsed, locale)
        : part.trim()
    })
    .join(locale === 'en' ? ', ' : '')
}
