// SVELTE
import { untrack } from 'svelte'
// API
import { getUser, updateUserProfile } from '#lib/api/user.remote.js'
// NOTIFICATIONS
import { toast } from 'svelte-sonner'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'

/**
 * Restores and saves the viewer's contribution filters across profile visits.
 * @param app - The route-owned context with the active account.
 * @returns Reactive filters and guarded preference mutations.
 */
export function useProfileContributionPreferences(app: ResourceViewCtx) {
  let isSaving = $state(false)
  const preferences = $derived(app.account.user?.preferences?.profileContributions)
  const observePrisms = $derived(
    preferences?.observePrisms ??
      (app.hub as Hub | undefined)?.organisations?.length !== 1,
  )

  // Synchronize restored preferences with the profile request's map scope.
  $effect(() => {
    const context = app.panels.state.profile.ctx
    const observe = observePrisms
    if (!context || !app.hub) return
    untrack(() => {
      if (context.observePrisms === observe) return
      context.observePrisms = observe
      void app.refreshUserProfile()
    })
  })

  /**
   * Saves a filter without replacing unrelated local preference branches.
   * @param patch - Contribution settings changed by the viewer.
   * @returns Nothing after persistence or rollback completes.
   */
  async function save(
    patch: NonNullable<UserPreferences['profileContributions']>,
  ): Promise<void> {
    const user = app.account.user
    if (!user || isSaving) return
    const revision = app.account.revision
    const previous = user.preferences?.profileContributions
    const next = { ...previous, ...patch }
    const preferences = { ...app.getUserPreferences(), profileContributions: next }
    isSaving = true
    app.applyUserProfile({ preferences }, revision)
    try {
      await updateUserProfile({
        id: user.id,
        data: { preferences: JSON.stringify(preferences) },
      }).updates(getUser({ ref: user.id, refKey: 'id', meta: { profile: 'self' } }))
    } catch (error) {
      if (revision !== app.account.revision) return
      app.applyUserProfile(
        {
          preferences: {
            ...app.getUserPreferences(),
            profileContributions: previous,
          },
        },
        revision,
      )
      console.error('Failed to save contribution preferences', error)
      toast.error('Failed to save contribution preferences')
    } finally {
      isSaving = false
    }
  }

  return {
    get showAll() {
      return preferences?.showAll ?? false
    },
    get observePrisms() {
      return observePrisms
    },
    get disabled() {
      return isSaving || !app.account.user
    },
    setShowAll: (checked: boolean | null): Promise<void> =>
      save({ showAll: checked === true }),
    toggleObservePrisms: (): Promise<void> => save({ observePrisms: !observePrisms }),
  }
}
