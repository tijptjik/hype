// DOMAIN
import { value } from './model'
// TYPES
import type { IndoorFeature } from './model'

export type LevelOption = {
  value: string
  label: string
  floor: string
  exit: string
  line?: string
  kind: string
}

/** Build the shared ordered floor picker entries. @param levels Source floors. @returns All-level and individual floor options. */
export function stationLevelOptions(levels: IndoorFeature[]): LevelOption[] {
  return [
    { value: 'all', label: 'All levels', floor: 'All levels', exit: '', kind: 'all' },
    ...levels
      .toSorted(
        (a, b) =>
          Number(b.properties.level_ordinal) - Number(a.properties.level_ordinal),
      )
      .map(level => {
        const name = value(level.properties, 'level_name_en').trim()
        const exitPrefix = name.match(
          /^Exits?\s+([A-Z]\d*(?:\s*(?:&|,|and|\/)\s*[A-Z]\d*)*)\s+/i,
        )
        const exit = exitPrefix?.[1] ?? ''
        const description = name.slice(exitPrefix?.[0].length ?? 0)
        const qualified = description.match(/^(.*?)\s*\(([^()]+)\)$/)
        const base = qualified?.[1].trim() ?? description
        const destination = base.match(/^(Platform\s+\d+)\s*[-–—]\s*to\s+(.+)$/i)
        // Keep source qualifiers as subtitles for every kind of floor, including exits.
        const service = destination
          ? `To ${destination[2].trim()}`
          : (qualified?.[2].trim() ?? '')
        const line = /^Airport Express(?:\s|$)/i.test(service)
          ? 'Airport Express'
          : service
        const floor = destination
          ? destination[1]
          : base
              .replace(
                /^(Platform|Concourse)\s+Level(?:\s+(\d+))?$/i,
                (_, type: string, number: string | undefined) =>
                  `${type[0].toUpperCase()}${type.slice(1).toLowerCase()}${number ? ` ${number}` : ''}`,
              )
              .replace(/\s+Level$/i, '')
        return {
          value: value(level.properties, 'level_id'),
          label: [floor, exit ? `Exit ${exit}` : '', line].filter(Boolean).join(' · '),
          floor,
          exit,
          line,
          kind: exit
            ? 'exit'
            : /platform/i.test(name)
              ? 'platform'
              : /concourse/i.test(name)
                ? 'concourse'
                : 'floor',
        }
      }),
  ]
}

/** Format a compact exploded-map label without changing the source exit identity.
 * @param sourceName Publisher floor name.
 * @returns Exit and floor separated by a middle dot, with numeric, upper and basement floor notation.
 * @remarks An unnumbered basement is B/F; numbered basements are B<number>/F.
 */
export function stationFloorCallout(sourceName: string): string {
  const name = sourceName.trim()
  // Unwrap descriptive suffixes before formatting their floor and exit prefixes.
  const qualified = name.match(/^(.*?)\s*\(([^()]+)\)$/)
  if (qualified) {
    const qualifier = qualified[2]
      .trim()
      .replace(/^Airport Express\s+to or from.+$/i, 'Airport Express')
    return `${stationFloorCallout(qualified[1])} · ${qualifier}`
  }
  const destination = name.match(/^(Platform\s+\d+)\s*[-–—]\s*to\s+(.+)$/i)
  if (destination) return `${destination[1]} · To ${destination[2].trim()}`
  const exit = name.match(
    /^(Exits?\s+[A-Z]\d*(?:\s*(?:&|,|and|\/)\s*[A-Z]\d*)*)\s+(.+)$/i,
  )
  // Format the description separately so every exit gets exactly one separator.
  const description = exit ? exit[2].replace(/^·\s*/, '') : name
  const basement = description.match(/^Basement(?:\s+Level)?(?:\s+(\d+))?$/i)
  const numbered = description.match(/^(?:(Upper)\s+)?Level\s+(\d+)$/i)
  const floor = basement
    ? `B${basement[1] ?? ''}/F`
    : exit && numbered
      ? `${numbered[1] ? 'U' : ''}${numbered[2]}/F`
      : description
          .replace(/^Ground Level$/, exit ? 'G/F' : 'Ground')
          .replace(/^Mezzanine Level$/, exit ? 'M/F' : 'Mezzanine')
          .replace(' Ground Level', ' · G/F')
          .replace(' Mezzanine Level', ' · M/F')
          .replace(/\s+Level\b/i, '')
  return exit ? `${exit[1]} · ${floor}` : floor
}
