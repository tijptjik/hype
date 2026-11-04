/** Minimal authorised organisation data used to reconcile the shared prism selection. */
export interface MessagingOrganisationChoice {
  id: string
  hasMessaging?: boolean
  isMember?: boolean
}

/**
 * Identify the messaging inbox routes without affecting organisation configuration pages.
 * @param pathname Current URL path, optionally with a trailing slash.
 * @returns Whether the organisation prism must be exclusive on this route.
 */
export function isMessagingInboxPath(pathname: string): boolean {
  return /^\/admin\/(messaging|whatsapp)\/?$/.test(pathname)
}

/**
 * Resolve one authorised organisation using existing pins before sensible initial defaults.
 * @param organisations Server-authorised organisations in their display order.
 * @param pinnedIds Existing organisation prism order.
 * @returns First permitted pin, sole membership, or the first configured organisation; null when selection is needed.
 * @remarks Never invents a second selection store or selects an inaccessible organisation.
 */
export function chooseMessagingOrganisation(
  organisations: readonly MessagingOrganisationChoice[],
  pinnedIds: readonly string[],
): string | null {
  const allowed = new Set(organisations.map(organisation => organisation.id))
  const pinned = pinnedIds.find(id => allowed.has(id))
  if (pinned) return pinned
  const memberships = organisations.filter(organisation => organisation.isMember)
  if (memberships.length === 1) return memberships[0].id
  if (organisations.length === 1) return organisations[0].id
  return memberships.find(organisation => organisation.hasMessaging)?.id
    ?? organisations.find(organisation => organisation.hasMessaging)?.id
    ?? null
}
