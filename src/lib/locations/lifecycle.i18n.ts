// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { LifecycleStatus } from './lifecycle'

/** Localize lifecycle without presenting unknown as open/standing.
 * @param status Explicit lifecycle vocabulary.
 * @returns Concise localized label.
 */
export function lifecycleLabel(status: LifecycleStatus): string {
  switch (status) {
    case 'open':
      return m.location_lifecycle_open()
    case 'temporarily_closed':
      return m.location_lifecycle_temporarily_closed()
    case 'permanently_closed':
      return m.location_lifecycle_permanently_closed()
    case 'standing':
      return m.location_lifecycle_standing()
    case 'demolished':
      return m.location_lifecycle_demolished()
    default:
      return m.location_lifecycle_unknown()
  }
}
