// SVELTE
import { onMount } from 'svelte'
// API
import { getMessagingAppearance } from '#lib/api/messagingAppearance.remote.js'
// MESSAGING
import {
  DEFAULT_CHAT_APPEARANCE,
  type ChatAppearance,
} from '#lib/messaging/appearance.js'

/** Load one organisation's committed shared chat background.
 * @param organisationId Immutable organisation identity; the parent keys its lifetime.
 * @returns Read-only appearance and readiness; the organisation form owns all writes.
 */
export function useMessagingAppearance(organisationId: string) {
  const input = { meta: { isAdminRequest: true as const }, organisationId }
  let appearance = $state<ChatAppearance>({ ...DEFAULT_CHAT_APPEARANCE })
  let loading = $state(true),
    error = $state('')
  let active = false
  onMount(() => {
    active = true
    const query = getMessagingAppearance(input)
    void query
      .refresh()
      .then(() => query)
      .then(value => {
        if (active) appearance = value
      })
      .catch(cause => {
        if (active)
          error =
            cause instanceof Error ? cause.message : 'Unable to load chat background'
      })
      .finally(() => {
        if (active) loading = false
      })
    return () => {
      active = false
    }
  })
  return {
    get appearance() {
      return appearance
    },
    get loading() {
      return loading
    },
    get error() {
      return error
    },
  }
}
