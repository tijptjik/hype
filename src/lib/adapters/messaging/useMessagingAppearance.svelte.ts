// SVELTE
import { onMount } from 'svelte'
// API
import {
  getMessagingAppearance,
  setMessagingAppearance,
} from '#lib/api/messagingAppearance.remote.js'
// MESSAGING
import {
  DEFAULT_CHAT_APPEARANCE,
  type ChatAppearance,
} from '#lib/messaging/appearance.js'

/** Load and save one organisation's shared chat background.
 * @param organisationId Immutable organisation identity; the parent keys its lifetime.
 * @returns Appearance, readiness and an explicit save action with visible errors.
 */
export function useMessagingAppearance(organisationId: string) {
  const input = { meta: { isAdminRequest: true as const }, organisationId }
  let appearance = $state<ChatAppearance>({ ...DEFAULT_CHAT_APPEARANCE })
  let loading = $state(true),
    saving = $state(false),
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
  /** Save an explicit background selection without changing account configuration.
   * @param value Validated appearance from the editor.
   * @returns Whether the save completed while this organisation remained mounted.
   */
  async function save(value: ChatAppearance): Promise<boolean> {
    if (saving || loading || !active) return false
    saving = true
    error = ''
    try {
      const saved = await setMessagingAppearance({ ...input, appearance: value })
      if (!active) return false
      appearance = saved
      return true
    } catch (cause) {
      if (active)
        error =
          cause instanceof Error ? cause.message : 'Unable to save chat background'
      return false
    } finally {
      if (active) saving = false
    }
  }
  return {
    get appearance() {
      return appearance
    },
    get loading() {
      return loading
    },
    get saving() {
      return saving
    },
    get error() {
      return error
    },
    save,
  }
}
