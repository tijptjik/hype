// DOMAIN
import { connectionIdentity, connectionValue } from './connectionCorrections'
import { value } from './model'
// TYPES
import type { MapBundle } from './releases'

export type PublicationChange = { label: string; before: string; after: string }

/** Compare immutable published connections and floor labels.
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
  const describeConnection = (
    connection: NonNullable<typeof after.connections>[number] | undefined,
  ): string =>
    !connection
      ? 'Absent'
      : `${levels.get(connection.fromLevel) ?? connection.fromLevel} → ${levels.get(connection.toLevel) ?? connection.toLevel} · ${connection.enabled ? 'Enabled' : 'Disabled'} · ${connection.direction === 'both' ? 'Both ways' : connection.direction === 'forward' ? 'One way' : 'Unknown direction'} · entrances ${JSON.stringify([connection.fromEntrance ?? null, connection.toEntrance ?? null])}`
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
  return changes
}
