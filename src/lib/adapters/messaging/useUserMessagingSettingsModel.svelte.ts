// SVELTE
import { onMount } from 'svelte'
// API
import { getMessagingAccounts, getMessagingOrganisations, getUserMessagingSettings, setUserMessagingIdentity, setUserMessagingPreference, verifyUserMessagingIdentity } from '#lib/api/messaging.remote.js'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'

/** Edit private recipient preferences separately from organisation account registration.
 * @param userId Target user, or undefined for the current account.
 * @param canVerify Whether the UI should offer global-admin verification controls.
 * @returns Reactive form state and server-authorized actions.
 */
export function useUserMessagingSettingsModel(userId?: string, canVerify = false) {
  let settings = $state<Awaited<ReturnType<typeof getUserMessagingSettings>>>({ platform: 'whatsapp', identities: [] })
  let addresses = $state<Record<MessagingPlatform, string>>({ whatsapp: '', telegram: '' })
  let accounts = $state<{ id: string; platform: MessagingPlatform; organisation: string }[]>([])
  let busy = $state(false)
  let loading = $state(true)
  let failure = $state('')
  let active = false

  /** Reload verified state after a successful change. */
  async function refresh(): Promise<void> {
    const query = getUserMessagingSettings({ userId })
    await query.refresh()
    const value = await query
    if (!active) return
    settings = value
    for (const platform of ['whatsapp', 'telegram'] as const) addresses[platform] = value.identities.find(row => row.platform === platform)?.address ?? ''
  }

  /** Retain form values on failure and reload authoritative verification after success. */
  async function run(action: () => Promise<unknown>): Promise<void> {
    if (busy) return
    busy = true; failure = ''
    try { await action(); await refresh() }
    catch (cause) { if (active) failure = cause instanceof Error ? cause.message : 'Unable to save messaging settings' }
    finally { busy = false }
  }

  onMount(() => {
    active = true
    void (async () => {
      await refresh()
      if (!canVerify || !active) return
      const meta = { isAdminRequest: true as const }
      const organisations = await getMessagingOrganisations({ meta })
      const available = []
      for (const organisation of organisations) {
        if (!active) return
        for (const account of await getMessagingAccounts({ meta, organisationId: organisation.id })) {
          if (account.externalAccountId && account.enabled) available.push({ id: account.id, platform: account.platform, organisation: organisation.code })
        }
      }
      if (active) accounts = available
    })().catch(cause => { if (active) failure = cause instanceof Error ? cause.message : 'Unable to load messaging settings' }).finally(() => { if (active) loading = false })
    return () => { active = false }
  })

  return { get settings() { return settings }, get addresses() { return addresses }, get accounts() { return accounts }, get busy() { return busy }, get loading() { return loading }, get error() { return failure },
    setPreference: (platform: MessagingPlatform | null) => run(() => setUserMessagingPreference({ userId, platform })),
    saveIdentity: (platform: MessagingPlatform) => run(() => setUserMessagingIdentity({ userId, platform, address: addresses[platform].trim() || null })),
    verify: (accountId: string, address: string) => run(() => {
      if (!userId) throw new Error('Select a user in the directory before verifying ownership')
      return verifyUserMessagingIdentity({ meta: { isAdminRequest: true }, userId, accountId, address, confirmOwnership: true })
    }),
  }
}
