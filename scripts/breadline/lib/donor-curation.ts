// Reviewed operator corrections are keyed by stable Breadline identity, never display name.
const curations = {
  '767': {
    phoneNumber: ['+85229722222'],
    reason: 'Operator supplied Harlan’s phone on 2026-11-24.',
  },
  '768': {
    operatingStatus: 'permanently_closed',
    reason: 'Operator confirmed Wooloomooloo Prime closed on 2026-11-24.',
  },
} as const

/** Resolve durable operator curation independently of changing upstream values.
 * @param table Breadline source namespace.
 * @param sourceId Stable source identity.
 * @returns Reviewed corrections, or null for an uncurated source.
 * @remarks Explicit operator review is required to remove these rules. Raw source hashes remain unchanged.
 */
export function reviewedDonorCuration(
  table: string,
  sourceId: string,
): {
  phoneNumber?: readonly string[]
  operatingStatus?: 'permanently_closed'
  reason: string
} | null {
  if (table !== 'donors' || !Object.hasOwn(curations, sourceId)) return null
  return curations[sourceId as keyof typeof curations]
}
