// SVELTEKIT
import { goto } from '$app/navigation'
// AUTH
import { signOut } from '$lib/auth/client'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import {
  debouncedUpdateUsername,
  validateUsernameIssues,
} from '$lib/client/services/user'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { ProfileSectionProps } from '$lib/bits/patterns/panels/sections'
import type { CurrentUser } from '$lib/db/zod/schema/user.types'

type UseProfileSectionModelOptions = {
  hideActions?: boolean
  hideEditableFields?: boolean
}

/**
 * Adapter that maps app context state and handlers into the profile section pattern API.
 * @param appCtx - Shared app context used for user state and profile mutations.
 * @param getOptions - Getter for call-site visibility options.
 * @returns Profile section model exposing `getProfileProps()` for `<ProfileSection />`.
 */
export function useProfileSectionModel(
  appCtx: AppCtx,
  getOptions: () => UseProfileSectionModelOptions,
): { getProfileProps: () => ProfileSectionProps } {
  let isEditingUsername = $state(false)
  let isLoadingUsername = $state(false)
  let showSuccessIndicator = $state(false)
  let showErrorIndicator = $state(false)
  let editedUsername = $state('')

  let successTimer: ReturnType<typeof setTimeout> | undefined
  let errorTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimer(timer: ReturnType<typeof setTimeout> | undefined): void {
    if (timer) {
      clearTimeout(timer)
    }
  }

  function showTransientError(): void {
    showErrorIndicator = true
    clearTimer(errorTimer)
    errorTimer = setTimeout(() => {
      showErrorIndicator = false
    }, 2500)
  }

  function showTransientSuccess(): void {
    showSuccessIndicator = true
    clearTimer(successTimer)
    successTimer = setTimeout(() => {
      showSuccessIndicator = false
    }, 2500)
  }

  function getUserDisplayName(): string {
    const user = appCtx.getUser()

    if (!user) {
      return m.anonymous()
    }

    return user.username ?? ('name' in user ? user.name : null) ?? m.anonymous()
  }

  $effect(() => {
    if (editedUsername && validateUsernameIssues(editedUsername).issues.length > 0) {
      showTransientError()
      return
    }

    showErrorIndicator = false
    clearTimer(errorTimer)
  })

  function handleStartEditingUsername(): void {
    const user = appCtx.getUser()
    if (!user) return

    editedUsername = user.username || ''
    isEditingUsername = true
  }

  async function handleSaveUsername(): Promise<void> {
    const user = appCtx.getUser()
    if (!user || !editedUsername.trim()) return

    const { normalizedUsername, issues } = validateUsernameIssues(editedUsername.trim())

    if (issues.length > 0) {
      showTransientError()
      return
    }

    isLoadingUsername = true

    appCtx.setUser({
      ...user,
      username: normalizedUsername,
    } as CurrentUser)

    await debouncedUpdateUsername((user as CurrentUser).id, normalizedUsername, {
      onSuccess: () => {
        isEditingUsername = false
        isLoadingUsername = false
        showTransientSuccess()
      },
      onInvalid: () => {
        isLoadingUsername = false
        showTransientError()
      },
      onError: (error: unknown) => {
        console.error('Failed to save username:', error)
        isLoadingUsername = false
        showTransientError()
      },
    })
  }

  function handleCancelEdit(): void {
    isEditingUsername = false
    editedUsername = ''
  }

  function handleOpenProfile(): void {
    const user = appCtx.getUser()
    appCtx.setPanelCtx(Panel.profile, 'username', user?.username)
    appCtx.togglePanel(Panel.profile)
  }

  async function handleLogout(): Promise<void> {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          goto('/')
        },
        onError: error => {
          console.error('Sign out failed:', error)
        },
      },
    })
  }

  return {
    getProfileProps: () => ({
      ...getOptions(),
      avatarSrc: appCtx.getUser()?.image ?? null,
      userDisplayName: getUserDisplayName(),
      userAttribution: appCtx.getUser()?.attribution ?? null,
      isEditingUsername,
      isLoadingUsername,
      showSuccessIndicator,
      showErrorIndicator,
      editedUsername,
      onEditedUsernameChange: value => {
        editedUsername = value
      },
      usernameInputPlaceholder: m.warm_that_duck_slide(),
      openProfileText: m.whole_livid_alligator_commend(),
      logoutText: m.profile__logout(),
      onStartEditingUsername: handleStartEditingUsername,
      onSaveUsername: handleSaveUsername,
      onCancelEdit: handleCancelEdit,
      onOpenProfile: handleOpenProfile,
      onLogout: handleLogout,
    }),
  }
}
