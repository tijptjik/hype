// SVELTE
import { onDestroy } from 'svelte'
// SVELTEKIT
import { goto } from '$app/navigation'
// AUTH
import { signOut } from '#lib/auth/client.js'
import { clearSignOutIntent, markSignOutIntent } from '#lib/auth/bootstrap.js'
import {
  isGuestUser as isGuestUserSession,
  requestAccountUpgrade,
  requestProfileUpgrade,
  toSafeReturnPath,
} from '#lib/auth/upgrade.js'
// I18N
import { m } from '#lib/i18n.js'
// SERVICES
import {
  debouncedUpdateUsername,
  validateUsernameIssues,
} from '#lib/client/services/user.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// CONTEXT
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { ProfileSectionProps } from '#lib/bits/patterns/panels/sections/index.js'
import type { CurrentUser } from '#lib/db/zod/schema/user.types.js'

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
  appCtx: ResourceViewCtx,
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

  /**
   * Restores the previous username only if the current app user still reflects the
   * optimistic value written by the pending save request.
   *
   * @param userId - The user ID associated with the optimistic mutation.
   * @param optimisticUsername - The username applied before the save resolved.
   * @param previousUsername - The username value to restore on failure.
   * @param optimisticDisplayUsername - Casing applied by this save.
   * @param previousDisplayUsername - Previous casing to restore.
   * @param accountRevision - Account lifetime that initiated the save.
   */
  function restoreOptimisticUsername(
    userId: string,
    optimisticUsername: string,
    previousUsername: CurrentUser['username'],
    optimisticDisplayUsername: string,
    previousDisplayUsername: CurrentUser['displayUsername'],
    accountRevision: number,
  ): void {
    const currentUser = appCtx.getUser()

    if (!currentUser || currentUser.id !== userId) return
    if (
      currentUser.username !== optimisticUsername ||
      currentUser.displayUsername !== optimisticDisplayUsername
    )
      return

    appCtx.applyUserProfile(
      {
        username: previousUsername,
        displayUsername: previousDisplayUsername,
      },
      accountRevision,
    )
  }

  onDestroy(() => {
    clearTimer(successTimer)
    clearTimer(errorTimer)
  })

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

    return (
      user.displayUsername ??
      user.username ??
      ('name' in user ? user.name : null) ??
      m.anonymous()
    )
  }

  /** Returns whether the current session belongs to an anonymous guest. */
  function isGuestUser(): boolean {
    return isGuestUserSession(appCtx.getUser())
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

    editedUsername = user.displayUsername || user.username || ''
    isEditingUsername = true
  }

  async function handleSaveUsername(): Promise<void> {
    const user = appCtx.getUser()
    if (!user || !editedUsername.trim()) return

    const { normalizedUsername, issues } = validateUsernameIssues(editedUsername.trim())
    const accountRevision = appCtx.account.revision
    const previousUsername = user.username ?? null
    const previousDisplayUsername = user.displayUsername ?? null
    const displayUsername = editedUsername.trim()

    if (issues.length > 0) {
      showTransientError()
      return
    }

    isLoadingUsername = true

    appCtx.applyUserProfile({
      username: normalizedUsername,
      displayUsername,
    })

    await debouncedUpdateUsername((user as CurrentUser).id, displayUsername, {
      onSuccess: () => {
        isEditingUsername = false
        isLoadingUsername = false
        showTransientSuccess()
      },
      onInvalid: () => {
        restoreOptimisticUsername(
          user.id,
          normalizedUsername,
          previousUsername,
          displayUsername,
          previousDisplayUsername,
          accountRevision,
        )
        isLoadingUsername = false
        showTransientError()
      },
      onError: (error: unknown) => {
        console.error('Failed to save username:', error)
        restoreOptimisticUsername(
          user.id,
          normalizedUsername,
          previousUsername,
          displayUsername,
          previousDisplayUsername,
          accountRevision,
        )
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
    if (isGuestUserSession(user)) {
      requestProfileUpgrade(window.location.href)
      return
    }
    appCtx.setPanelCtx(Panel.profile, 'username', user?.username)
    appCtx.togglePanel(Panel.profile)
  }

  async function handleLogout(): Promise<void> {
    // Prevent automatic guest bootstrap from racing the explicit sign-in redirect.
    markSignOutIntent()
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          goto('/signin')
        },
        onError: error => {
          clearSignOutIntent()
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
      isGuest: isGuestUser(),
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
      upgradeText: m.guest__create_account(),
      signInText: m.guest__sign_in(),
      onStartEditingUsername: handleStartEditingUsername,
      onSaveUsername: handleSaveUsername,
      onCancelEdit: handleCancelEdit,
      onOpenProfile: handleOpenProfile,
      onLogout: handleLogout,
      onUpgrade: () => requestAccountUpgrade('account', window.location.href),
      onSignIn: () =>
        goto(
          `/signin?returnTo=${encodeURIComponent(toSafeReturnPath(window.location.href))}`,
        ),
    }),
  }
}
