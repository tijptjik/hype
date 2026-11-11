/** History labels describe the workflow, independently of the actor's current role. */
export const locationActionReasons = {
  'staff-update': 'Staff updated location',
  'values-retained': 'Organisation retained location values',
  'contribution-accepted': 'Location contribution accepted',
  'policy-update': 'Staff updated location policy',
} as const

export type LocationHistoryAction = keyof typeof locationActionReasons
