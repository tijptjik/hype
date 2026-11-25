// I18N
import { t } from './i18n'
// TYPES
import type {
  RecorderRecord,
  RecorderLocation,
  RecorderPlace,
} from '../../../../src/lib/fieldResearch/recorder'

export type IndexView = {
  mode: 'all' | 'building' | 'floor'
  oldestFirst: boolean
  collapsed: string[]
}
export type IndexRow = { record: RecorderRecord; number: number }
export type RecordSection = { key: string; label: string; rows: IndexRow[] }
export type PlanFloor = { label: string; ordinal?: number }
type FloorSection = RecordSection & { ordinal?: number; missing: boolean }
type BuildingSection = RecordSection & { sort: string; floors: FloorSection[] }
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Connect assigned units and readable parent buildings by identity.
 * @param places Session location catalogue.
 * @returns Building by selected location ID.
 */
function buildingOwners(places: RecorderLocation[]): Map<string, RecorderPlace> {
  const owners = new Map<string, RecorderPlace>()
  for (const place of places) {
    const owner = place.kind === 'building' ? place : place.building
    if (owner) {
      owners.set(place.id, owner)
      owners.set(owner.id, owner)
    }
  }
  return owners
}

/** Reconcile common indoor and facade names for the same physical storey. */
function floorName(name: string, ordinal?: number): PlanFloor {
  if (/^(?:g(?:\/?f)?|ground(?: floor)?)$/i.test(name))
    return { label: t('ground_floor'), ordinal: 0 }
  const numbered = /^(?:floor[ -]?(\d+)|(\d+)\s*\/f)$/i.exec(name)
  if (numbered) {
    const n = Number(numbered[1] ?? numbered[2])
    return { label: t('numbered_floor', { number: n }), ordinal: n }
  }
  const basement = /^(?:basement[ -]?|b)(\d+)$/i.exec(name)
  if (basement)
    return {
      label: t('numbered_basement', { number: Number(basement[1]) }),
      ordinal: -Number(basement[1]),
    }
  return { label: name, ordinal }
}

/** Assemble expanded index sections from the same rows used in the chronological list.
 * @param rows Captures in the requested display order, with their original sequence.
 * @param places Session location catalogue.
 * @param byFloor Include nested floor sections.
 * @param plans Floor labels keyed by immutable plan release hash and floor ID.
 * @returns Buildings in street and number order with missing placements last.
 */
export function recordGroups(
  rows: IndexRow[],
  places: RecorderLocation[],
  byFloor: boolean,
  plans: Map<string, Map<string, PlanFloor>>,
): BuildingSection[] {
  const owners = buildingOwners(places)
  const buildings = new Map<string, BuildingSection>()
  const floors = new Map<string, FloorSection>()
  for (const row of rows) {
    const { pin, locationId } = row.record
    const owner = owners.get(locationId ?? '')
    const key = JSON.stringify([owner?.id ?? null])
    let building = buildings.get(key)
    if (!building) {
      const label = owner?.address || owner?.name || t('no_record_building')
      building = {
        key,
        label,
        sort: owner ? owner.addressSortKey || label : '',
        rows: [],
        floors: [],
      }
      buildings.set(key, building)
    }
    building.rows.push(row)
    if (!byFloor) continue
    let floor: PlanFloor | undefined
    let unresolved = ''
    if (pin?.realm === 'interior') {
      const level = plans.get(pin.hash)?.get(pin.floorId)
      if (level?.label) floor = floorName(level.label, level.ordinal)
      else {
        const fromId = floorName(pin.floorId)
        if (fromId.ordinal !== undefined) floor = fromId
        else unresolved = JSON.stringify([pin.mapId, pin.floorId])
      }
    } else if (pin && 'surface' in pin) {
      if (pin.floorLabel) floor = floorName(pin.floorLabel)
      else if (pin.floorId) unresolved = JSON.stringify([pin.assetId, pin.floorId])
    }
    const floorKey = JSON.stringify([
      key,
      floor?.label.toLowerCase() ?? null,
      unresolved,
    ])
    let section = floors.get(floorKey)
    if (!section) {
      section = {
        key: floorKey,
        label:
          floor?.label || t(unresolved ? 'floor_label_unavailable' : 'no_record_floor'),
        ordinal: floor?.ordinal,
        missing: !floor,
        rows: [],
      }
      floors.set(floorKey, section)
      building.floors.push(section)
    }
    section.rows.push(row)
  }
  for (const building of buildings.values()) {
    building.floors.sort(
      (a, b) =>
        Number(a.missing) - Number(b.missing) ||
        (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) ||
        collator.compare(a.label, b.label),
    )
  }
  return [...buildings.values()].sort(
    (a, b) =>
      Number(!a.sort) - Number(!b.sort) ||
      collator.compare(a.sort, b.sort) ||
      collator.compare(a.label, b.label) ||
      a.key.localeCompare(b.key),
  )
}
