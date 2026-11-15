// DOMAIN
import { value } from './model'
// TYPES
import type { IndoorFeature } from './model'

export type LevelOption = {
  value: string
  label: string
  floor: string
  exit: string
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
        const name = value(level.properties, 'level_name_en')
        const exit = name.match(/^Exit\s+(\S+)\s+/i)?.[1] ?? ''
        const floor = name.replace(/^Exit\s+\S+\s+/i, '').replace(/\s+Level$/i, '')
        return {
          value: value(level.properties, 'level_id'),
          label: exit ? `${floor} · Exit ${exit}` : floor,
          floor,
          exit,
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
