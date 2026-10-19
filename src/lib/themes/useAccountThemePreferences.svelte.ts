// SVELTE
import { untrack } from 'svelte'
// THIRD PARTY
import { toast } from 'svelte-sonner'
// API
import {
  getThemePreferences,
  saveThemePreferences,
} from '#lib/api/themePreferences.remote.js'
// THEME
import { ThemePreferenceSync } from './preferencesSync'
// TYPES
import type { AccountState } from '#lib/context/account.svelte.js'
import type { ThemeModel } from './theme.svelte'

/**
 * Binds root appearance state to the current account, independently of settings panel visibility.
 * @param account - Root-owned session/profile state.
 * @param model - Root-owned theme controller.
 * @returns Nothing; the effect disconnects on account changes or layout destruction.
 */
export function useAccountThemePreferences(
  account: AccountState,
  model: ThemeModel,
): void {
  $effect(() => {
    const userId = account.session?.id
    const revision = account.revision
    if (!userId) return
    const sync = untrack(
      () =>
        new ThemePreferenceSync(model, {
          read: async () => {
            // Refresh the query on each account lifetime; cached queries can outlive login.
            const query = getThemePreferences({ accountId: userId })
            await query.refresh()
            return await query
          },
          write: async preferences => {
            if (account.revision !== revision) return
            return saveThemePreferences({ accountId: userId, preferences })
          },
          publish: theme => {
            if (account.revision !== revision) return
            const preferences = account.user?.preferences
            if (preferences)
              account.applyProfile({ preferences: { ...preferences, theme } }, revision)
          },
          onError: error => {
            console.error('Could not synchronize appearance preferences:', error)
            toast.error(
              'Could not sync appearance settings. Your choice is saved in this browser.',
            )
          },
        }),
    )
    void sync.restore()
    return () => sync.dispose()
  })
}
