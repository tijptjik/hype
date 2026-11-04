// SVELTE
import { onMount } from 'svelte'
// API
import {
  connectMessagingAccount,
  disconnectMessagingAccount,
  getMessagingAccounts,
  loginTelegramAccount,
  registerMessagingAccount,
  unwatchMessagingAccount,
  watchMessagingAccount,
} from '#lib/api/messaging.remote.js'
// TYPES
import type {
  BridgeStatus,
  LoginInput,
  MessagingPlatform,
} from '#lib/messaging/types.js'

type Account = Awaited<ReturnType<typeof getMessagingAccounts>>[number]
const meta = { isAdminRequest: true as const }

/** Manage organisation account configuration and tab leases while the facet is mounted.
 * @param organisationId Stable organisation ID; the parent keys this component by organisation.
 * @returns Reactive configuration state and authorized account actions.
 */
export function useOrganisationMessagingModel(organisationId: string) {
  let accounts = $state<Account[]>([])
  let statuses = $state<Partial<Record<MessagingPlatform, BridgeStatus>>>({})
  let busy = $state<MessagingPlatform | null>(null)
  let pendingAction = $state<string | null>(null)
  const statusRevision: Record<MessagingPlatform, number> = { whatsapp: 0, telegram: 0 }
  let failure = $state('')
  let accountFailures = $state<Partial<Record<MessagingPlatform, string>>>({})
  let loading = $state(true)
  let tabId = ''
  let alive = false
  let polling = false

  /** Refresh only this organisation's account configuration. */
  async function refresh(): Promise<void> {
    const query = getMessagingAccounts({ meta, organisationId })
    await query.refresh()
    const next = await query
    if (alive) accounts = next
  }

  /** Heartbeats renew leases and expose rotating QR/password states without starting registration. */
  async function poll(): Promise<void> {
    if (polling || !alive) return
    polling = true
    try {
      for (const account of accounts) {
        if (!alive) break
        const revision = statusRevision[account.platform]
        // One unavailable bridge must not prevent the other account renewing its lease.
        try {
          const status = await watchMessagingAccount({
            meta,
            accountId: account.id,
            tabId,
          })
          if (
            alive &&
            revision === statusRevision[account.platform] &&
            busy !== account.platform
          ) {
            statuses[account.platform] = status
            delete accountFailures[account.platform]
          } else if (!alive)
            await unwatchMessagingAccount({ meta, accountId: account.id, tabId }).catch(
              () => {},
            )
        } catch (cause) {
          if (
            alive &&
            revision === statusRevision[account.platform] &&
            busy !== account.platform
          ) {
            const platform = account.platform === 'telegram' ? 'Telegram' : 'WhatsApp'
            accountFailures[account.platform] =
              `${platform}: ${cause instanceof Error ? cause.message : 'Unable to reach the messaging service'}`
          }
        }
      }
    } finally {
      polling = false
    }
  }

  /** Resolve or register the organisation's account, never an operator's personal account. */
  async function accountFor(platform: MessagingPlatform): Promise<string> {
    const existing = accounts.find(account => account.platform === platform)
    if (existing) return existing.id
    const created = await registerMessagingAccount({ meta, organisationId, platform })
    await refresh()
    return created.id
  }

  /** Run an explicit operator action and refresh its shared status. */
  async function act(
    platform: MessagingPlatform,
    action: 'connect' | 'stop' | LoginInput,
  ): Promise<void> {
    if (busy || !alive || !tabId) return
    busy = platform
    pendingAction = typeof action === 'string' ? action : action.kind
    statusRevision[platform]++
    delete accountFailures[platform]
    failure = ''
    try {
      const accountId = await accountFor(platform)
      if (!alive) return
      const input = { meta, accountId, tabId }
      if (action === 'stop') {
        await disconnectMessagingAccount({ meta, accountId })
        if (alive)
          statuses[platform] = {
            ...statuses[platform],
            connected: false,
            loggedOut: false,
            qr: null,
            qrExpiresAt: null,
            authState: 'disconnected',
          }
      } else {
        const status =
          action === 'connect'
            ? await connectMessagingAccount(input)
            : await loginTelegramAccount({ ...input, login: action })
        if (alive) statuses[platform] = status
      }
      await refresh()
    } catch (cause) {
      if (alive)
        failure =
          cause instanceof Error ? cause.message : 'Unable to update messaging account'
    } finally {
      statusRevision[platform]++
      busy = null
      pendingAction = null
    }
  }

  onMount(() => {
    alive = true
    tabId = crypto.randomUUID()
    void refresh()
      .then(poll)
      .catch(cause => {
        if (alive)
          failure =
            cause instanceof Error ? cause.message : 'Unable to load messaging accounts'
      })
      .finally(() => {
        if (alive) loading = false
      })
    const timer = setInterval(() => {
      void poll()
    }, 3_000)
    return () => {
      alive = false
      clearInterval(timer)
      for (const account of accounts)
        void unwatchMessagingAccount({ meta, accountId: account.id, tabId }).catch(
          () => {},
        )
      // A tab crash or failed release is handled by the bridge's expiring lease.
    }
  })

  return {
    get accounts() {
      return accounts
    },
    get statuses() {
      return statuses
    },
    get connectionErrors() {
      return accountFailures
    },
    get busy() {
      return busy
    },
    get pendingAction() {
      return pendingAction
    },
    get error() {
      return [failure, ...Object.values(accountFailures)].filter(Boolean).join(' · ')
    },
    get loading() {
      return loading
    },
    act,
  }
}
