// ROUTING
import { mtrCatalog, MTR_MAX_WALKING_METRES } from '#lib/routing/mtr.js'
// TYPES
import type { MtrAccess } from '#lib/routing/mtr.js'

/**
 * Resolves usable transit fields for the dedicated donor card.
 * @param feature Persisted walking access, including older pre-limit calculations.
 * @param locale Active locale for the station name.
 * @returns Validated station/exit/distance or null; no straight-line fallback.
 */
export function breadlineCardMtr(
  feature: Partial<Omit<MtrAccess, 'mtrResolution'>> & {
    mtrResolution?: MtrAccess['mtrResolution'] | null
  },
  locale: string,
): { station: string; exit: string; metres: number } | null {
  if (
    feature.mtrResolution?.status !== 'ready' ||
    feature.mtrDistance == null ||
    !Number.isFinite(feature.mtrDistance) ||
    feature.mtrDistance < 0 ||
    feature.mtrDistance > MTR_MAX_WALKING_METRES
  )
    return null
  const station = mtrCatalog.stations.find(row => row.id === feature.mtrStation)
  const exit = mtrCatalog.exits.find(row => row.id === feature.mtrExit)
  if (!station || !exit || exit.station !== station.id) return null
  return {
    station: locale.startsWith('zh') ? station.nameZh || station.name : station.name,
    exit: exit.ref || '—',
    metres: feature.mtrDistance,
  }
}

/** Date-specific adapter input. Claim operations remain owned by the run service. */
export type BreadlineRunPresentation = {
  dateLabel: string
  pickupWindow: string
  amountLabel: string
  claimed: boolean
  pending?: boolean
  onClaim: () => void | Promise<void>
}
