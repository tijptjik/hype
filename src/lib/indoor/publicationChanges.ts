// DOMAIN
import { connectionIdentity, connectionValue } from './connectionCorrections'
import { value } from './model'
// TYPES
import type { MapBundle } from './releases'

export type PublicationChange = { label: string; before: string; after: string }

/** Compare immutable published geometry, classifications, connections and floor labels.
 * @param current Selected publication. @param previous Preceding publication, if any.
 * @returns Human-readable changes for the fields curated by this editor.
 */
export function publicationChanges(
  current: MapBundle,
  previous?: MapBundle,
): PublicationChange[] {
  const changes: PublicationChange[] = []
  const before = previous?.data
  const after = current.data
  const levels = new Map(
    [...(before?.level_polygon.features ?? []), ...after.level_polygon.features].map(
      level => [
        value(level.properties, 'level_id'),
        value(level.properties, 'level_name_en'),
      ],
    ),
  )
  levels.set('@exterior', 'Outside / street')
  const describeConnection = (
    connection: NonNullable<typeof after.connections>[number] | undefined,
  ): string =>
    !connection
      ? 'Absent'
      : `${levels.get(connection.fromLevel) ?? connection.fromLevel} → ${levels.get(connection.toLevel) ?? connection.toLevel} · ${connection.enabled ? 'Enabled' : 'Disabled'} · ${connection.direction === 'both' ? 'Both ways' : connection.direction === 'forward' ? 'One way' : 'Unknown direction'} · entrances ${JSON.stringify([connection.fromEntrance ?? null, connection.toEntrance ?? null])}${connection.fromExterior || connection.toExterior ? ` · exterior ${JSON.stringify(connection.fromExterior ?? connection.toExterior)}` : ''}`
  const oldPairs = new Map(
    (before?.connections ?? []).map(c => [connectionIdentity(c), c]),
  )
  const newPairs = new Map(
    (after.connections ?? []).map(c => [connectionIdentity(c), c]),
  )
  for (const key of new Set([...oldPairs.keys(), ...newPairs.keys()])) {
    const old = oldPairs.get(key),
      next = newPairs.get(key)
    if (connectionValue(old) !== connectionValue(next))
      changes.push({
        label: `${next?.category ?? old?.category} connection`,
        before: describeConnection(old),
        after: describeConnection(next),
      })
  }
  for (const level of after.level_polygon.features) {
    const old = before?.level_polygon.features.find(
      item => item.properties.level_id === level.properties.level_id,
    )
    for (const field of ['level_name_en', 'level_name_zh', 'level_short_name_en']) {
      const oldValue = old ? value(old.properties, field) : ''
      const nextValue = value(level.properties, field)
      if (oldValue !== nextValue)
        changes.push({
          label: `${value(level.properties, 'level_name_en')} · ${field}`,
          before: oldValue || 'Absent',
          after: nextValue || 'Absent',
        })
    }
  }
  // Geometry changes must be visible during publication review, including removed floors and edited room categories.
  for (const [layer, identity, label] of [
    ['level_polygon', 'level_id', 'Floor geometry'],
    ['unit_polygon', 'unit_id', 'Spaces'],
  ] as const) {
    const oldFeatures = new Map(
      (before?.[layer].features ?? []).map(f => [value(f.properties, identity), f]),
    )
    const newFeatures = new Map(
      after[layer].features.map(f => [value(f.properties, identity), f]),
    )
    let added = 0,
      removed = 0,
      edited = 0
    for (const [id, feature] of newFeatures) {
      const old = oldFeatures.get(id)
      if (!old) added++
      else if (
        JSON.stringify(old.geometry) !== JSON.stringify(feature.geometry) ||
        (layer === 'unit_polygon' &&
          ['unit_name_en', 'unit_category', 'level_id'].some(
            key => value(old.properties, key) !== value(feature.properties, key),
          ))
      )
        edited++
    }
    for (const id of oldFeatures.keys()) if (!newFeatures.has(id)) removed++
    if (added || removed || edited)
      changes.push({
        label,
        before: `${oldFeatures.size} total`,
        after: `${newFeatures.size} total · ${added} added · ${edited} changed · ${removed} removed`,
      })
  }
  return changes
}
