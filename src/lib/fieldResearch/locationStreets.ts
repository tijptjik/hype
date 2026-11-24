// ADDRESS
import { streetDisplayName } from '#lib/addresses/formatting.js'
import { parseStreetNumber } from '#lib/addresses/streetNumber.js'

type StreetAddress = { street: string; number: string; label: string }

// Older display-only records can include a building before the numbered street and a district after it.
const streetLine =
  /^(?:(\d+[a-z]?(?:\s*(?:[-–—/&]|to)\s*(?:\d+[a-z]?|[a-z]))?)\s+)?(.+?\s(?:road|street|lane|avenue|drive|way|path|terrace|place|square|crescent|court|close|gardens|hill|highway|circuit|boulevard|rd|st|ln|ave)(?:\s+(?:north|south|east|west|central))?)\.?$/i

/** Read a street from explicit components or a numbered street in a legacy label.
 * @param label Retained display text, possibly containing multiple address lines.
 * @param street Structured street name, when available.
 * @param number Structured building number or range.
 * @returns Address lines with display-only grouping and ordering keys.
 */
export function researchStreetAddresses(
  label: string,
  street = '',
  number = '',
): StreetAddress[] {
  return (label.trim() || [number, street].filter(Boolean).join(' '))
    .split(/\s*[·\n]\s*/)
    .map((line, _, lines) => {
      const matches = line
        .split(/,\s*/)
        .map(part => streetLine.exec(part.trim()))
        .filter(match => match !== null)
      const match = matches.find(part => part[1]) ?? matches[0]
      // A composite display can name a second frontage beyond the primary structured address.
      const useComponents = lines.length === 1 || !match
      const name = (useComponents && street.trim()) || match?.[2] || ''
      const expression = (useComponents && number) || match?.[1] || ''
      const parsed = parseStreetNumber(expression)
      return {
        street: streetDisplayName(name.normalize('NFKC').replace(/\s+/g, ' '), 'en'),
        number: parsed.valid ? parsed.number.expression : '',
        label: line.trim(),
      }
    })
}
