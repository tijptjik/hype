// TYPES
import type { LocationResource } from './resource'

/** Compose a building part's display location from its explicit parent.
 * @param place Location profile with authorized parent context.
 * @returns Localized display text; existing authored address text takes precedence.
 */
export function buildingPartDisplay(place: LocationResource): Record<string, string> {
  const existing = place.facts?.location.address.fallbackDisplay ?? {}
  if (place.kind !== 'building_part' || !place.parentLocation || !place.facts)
    return existing
  const parent = place.parentLocation
  const names = place.facts.names
  const locales = new Set([
    ...Object.keys(names),
    ...Object.keys(parent.names),
    ...Object.keys(parent.displayAddress),
  ])
  const derived = Object.fromEntries(
    [...locales].flatMap(locale => {
      const part = names[locale] || names.en
      const address =
        parent.displayAddress[locale] ||
        parent.names[locale] ||
        parent.displayAddress.en ||
        parent.names.en
      return part && address ? [[locale, `${part}, ${address}`]] : []
    }),
  )
  return {
    ...derived,
    ...Object.fromEntries(
      Object.entries(existing).filter(([, value]) => value?.trim()),
    ),
  }
}
