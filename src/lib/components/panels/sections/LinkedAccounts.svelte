<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { page } from '$app/state'
import { slide } from 'svelte/transition'
// ICONS
import Facebook from 'virtual:icons/simple-icons/facebook'
import Google from 'virtual:icons/logos/google-icon'
import Wechat from 'virtual:icons/simple-icons/wechat'
import Mail from 'virtual:icons/lucide/mail'
import KeyRound from 'virtual:icons/lucide/key-round'
// AUTH
import { authClient, signIn, signUp, useSession } from '$lib/auth/client'
import {
  completePasskeyAccountUpgrade,
  PasskeyRegistrationError,
  PasskeySessionRefreshError,
} from '$lib/auth/passkey-upgrade'
import { isAuthProviderEnabled } from '$lib/auth/providers'
// I18N
import { m } from '$lib/i18n'

type Account = { providerId: string; accountId: string }
type Passkey = { id: string; name?: string; credentialID: string }
type SocialProvider = 'facebook' | 'google' | 'wechat'
type GuestAuthMode = 'create' | 'sign-in'
type SocialAccountInfo = { user?: { email?: string | null } }

const SOCIAL_PROVIDERS = [
  { id: 'google', label: 'Google', icon: Google },
  { id: 'facebook', label: 'Facebook', icon: Facebook },
  { id: 'wechat', label: 'WeChat', icon: Wechat },
] as const satisfies ReadonlyArray<{
  id: SocialProvider
  label: string
  icon: typeof Google
}>

const socialProviders = SOCIAL_PROVIDERS.filter(provider =>
  isAuthProviderEnabled(provider.id),
)

const FEEDBACK_DURATION_MS = 10_000

/**
 * Returns whether an address is Better Auth's generated placeholder for an
 * anonymous account rather than an email the person supplied.
 *
 * @param value - Stored user email address.
 * @returns `true` when the address must not be presented as a login email.
 */
function isAnonymousPlaceholderEmail(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase()
  return normalizedValue.startsWith('temp@') && normalizedValue.endsWith('.com')
}

let {
  accountUsername = '',
  isGuest = false,
  startGuestUpgradeOpen = false,
  guestAuthMode = 'create',
}: {
  accountUsername?: string
  isGuest?: boolean
  startGuestUpgradeOpen?: boolean
  guestAuthMode?: GuestAuthMode
} = $props()

const session = useSession()

let accounts = $state<Account[]>([])
let isLoading = $state(true)
let isEditing = $state(false)
let isBusy = $state(false)
let newPassword = $state('')
let showEmailSetup = $state(false)
let showPasskeySetup = $state(false)
let errorMessage = $state('')
let statusMessage = $state('')
let passkeys = $state<Passkey[]>([])
let accountEmail = $derived($session.data?.user?.email ?? '')
let visibleAccountEmail = $derived(
  isAnonymousPlaceholderEmail(accountEmail) ? '' : accountEmail,
)
let email = $state('')
let emailAccountName = $state('')
let preferredName = $state('')
let preferredUsername = $state('')
let preferredEmail = $state('')
let providerEmails = $state<Record<string, string>>({})
let accountLoadRequestId = 0
let loadedSessionUserId: string | undefined
// Synthetic guest emails must never appear as suggested login addresses after account promotion.
let resolvedEmail = $derived(
  $session.data?.user?.isAnonymous ? '' : visibleAccountEmail,
)
let linkedAccountLabel = $derived(visibleAccountEmail || accountUsername)
let isGuestSignIn = $derived(guestAuthMode === 'sign-in')
const oauthErrorMessage = $derived(
  page.url.searchParams.get('error') === 'account_already_linked_to_different_user'
    ? m.account__account_already_linked()
    : '',
)

$effect(() => {
  if (oauthErrorMessage) errorMessage = oauthErrorMessage
})

$effect(() => {
  if (startGuestUpgradeOpen) isEditing = true
})

$effect(() => {
  guestAuthMode
  showEmailSetup = false
  showPasskeySetup = false
  // Preserve the OAuth callback error that is set by the effect above.
  if (!oauthErrorMessage) errorMessage = ''
  statusMessage = ''
})

$effect(() => {
  if (!errorMessage && !statusMessage) return

  const feedbackTimer = window.setTimeout(() => {
    errorMessage = ''
    statusMessage = ''
  }, FEEDBACK_DURATION_MS)

  return () => window.clearTimeout(feedbackTimer)
})

// Reload linked sign-in methods once the active session identity is available.
$effect(() => {
  const sessionUserId = $session.data?.user?.id
  const hasSessionIdentityChanged = sessionUserId !== loadedSessionUserId

  // Do not track form input here: a keystroke must not reload and remount this section.
  if (!untrack(() => email) || hasSessionIdentityChanged) email = resolvedEmail

  if (isGuest) {
    accountLoadRequestId += 1
    accounts = []
    passkeys = []
    providerEmails = {}
    loadedSessionUserId = undefined
    isLoading = false
    return
  }

  if (!sessionUserId) {
    accountLoadRequestId += 1
    accounts = []
    passkeys = []
    providerEmails = {}
    loadedSessionUserId = undefined
    isLoading = true
    return
  }

  // A session refresh can update its atom without changing the signed-in user.
  // Keep the existing methods visible instead of refetching and remounting them.
  if (!hasSessionIdentityChanged) return

  const requestId = ++accountLoadRequestId
  loadedSessionUserId = sessionUserId
  isLoading = true
  void loadSignInMethods(requestId)
})

/**
 * Loads the linked accounts and passkeys for one specific session identity.
 *
 * @param requestId - Monotonic identifier used to discard stale session responses.
 * @returns A promise that resolves after the current session's methods are loaded.
 */
async function loadSignInMethods(requestId: number): Promise<void> {
  try {
    await Promise.all([loadAccounts(requestId), loadPasskeys(requestId)])
  } catch {
    // A transient session read failure leaves the methods empty until the next session sync.
  } finally {
    if (requestId === accountLoadRequestId) {
      isLoading = false
    }
  }
}

/**
 * Loads the providers currently linked to the signed-in user.
 *
 * @param requestId - Monotonic identifier used to discard stale session responses.
 * @returns A promise that resolves after the account request completes.
 */
async function loadAccounts(requestId: number = accountLoadRequestId): Promise<void> {
  try {
    const result = await authClient.listAccounts()
    if (requestId !== accountLoadRequestId) return

    if (!result.error && result.data) {
      accounts = result.data
      void loadProviderEmails(result.data, requestId)
    }
  } catch {
    // The caller keeps the section available so a later session sync can retry.
  }
}

/**
 * Loads the verified email supplied by each linked social provider.
 *
 * @param currentAccounts - Provider accounts whose email addresses should be resolved.
 * @param requestId - Monotonic identifier used to discard stale session responses.
 * @returns A promise that resolves after the provider email requests complete.
 */
async function loadProviderEmails(
  currentAccounts: Account[],
  requestId: number = accountLoadRequestId,
): Promise<void> {
  const socialAccounts = currentAccounts.filter(
    account => account.providerId !== 'credential',
  )
  const resolvedEmails = await Promise.all(
    socialAccounts.map(async account => {
      try {
        const result = await authClient.accountInfo({
          query: {
            accountId: account.accountId,
            providerId: account.providerId,
          },
        })
        const providerEmail = (result.data as SocialAccountInfo | null)?.user?.email
        return providerEmail ? [accountKey(account), providerEmail] : null
      } catch {
        // A provider may not expose an email or its authorization may have expired.
        return null
      }
    }),
  )

  if (requestId === accountLoadRequestId) {
    providerEmails = Object.fromEntries(
      resolvedEmails.filter((entry): entry is [string, string] => entry !== null),
    )
  }
}

/**
 * Loads passkeys currently registered for the signed-in user.
 *
 * @param requestId - Monotonic identifier used to discard stale session responses.
 * @returns A promise that resolves after the passkey request completes.
 */
async function loadPasskeys(requestId: number = accountLoadRequestId): Promise<void> {
  try {
    const result = await authClient.passkey.listUserPasskeys()
    if (requestId === accountLoadRequestId && !result.error && result.data) {
      passkeys = result.data
    }
  } catch {
    // Passkey support is optional when the browser or deployment is not configured.
  }
}

/** Registers a passkey using the current browser or password manager. */
async function handleAddPasskey(): Promise<void> {
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result = await authClient.passkey.addPasskey({ name: 'HYPE passkey' })
    if (result.error) {
      errorMessage = result.error.message || m.account__passkey_add_error()
      return
    }
    await loadPasskeys()
    statusMessage = m.account__passkey_added()
  } catch {
    errorMessage = m.account__passkey_add_error()
  } finally {
    isBusy = false
  }
}

/** Adds a passkey and upgrades the guest session into a reusable HYPE account. */
async function handleGuestPasskeySubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy) return

  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    await completePasskeyAccountUpgrade({
      name: preferredName,
      username: preferredUsername,
      email: preferredEmail,
      emailCallbackUrl: window.location.href,
    })

    if (preferredEmail.trim()) {
      statusMessage = m.guest__verification_sent()
    } else {
      statusMessage = m.account__passkey_added()
    }

    showPasskeySetup = false
  } catch (error) {
    errorMessage =
      error instanceof PasskeySessionRefreshError
        ? m.account__passkey_session_refresh_error()
        : error instanceof PasskeyRegistrationError && error.message
          ? error.message
          : m.account__passkey_add_error()
  } finally {
    isBusy = false
  }
}

/** Signs the guest into an existing account using a registered passkey. */
async function handleGuestPasskeySignIn(): Promise<void> {
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result = await signIn.passkey({})
    if (result.error) {
      errorMessage = result.error.message || m.guest__auth_generic_error()
      return
    }
    window.location.reload()
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

/** Removes one passkey while keeping another authentication method available. */
async function handleRemovePasskey(passkey: Passkey): Promise<void> {
  if (isBusy || (accounts.length === 0 && passkeys.length <= 1)) return
  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result = await authClient.passkey.deletePasskey({ id: passkey.id })
    if (result.error) throw new Error(result.error.message)
    passkeys = passkeys.filter(item => item.id !== passkey.id)
    statusMessage = m.account__passkey_removed()
  } catch {
    errorMessage = m.account__passkey_remove_error()
  } finally {
    isBusy = false
  }
}

/** Returns the icon component for a Better Auth provider identifier. */
function providerIcon(providerId: string) {
  if (providerId === 'google') return Google
  if (providerId === 'facebook') return Facebook
  if (providerId === 'wechat') return Wechat
  return Mail
}

/** Returns a readable label for an account provider in the expanded editor. */
function providerLabel(providerId: string): string {
  if (providerId === 'credential') return m.account__email()
  if (providerId === 'google') return 'Google'
  if (providerId === 'facebook') return 'Facebook'
  if (providerId === 'wechat') return 'WeChat'
  return providerId
}

/** Returns a stable local key for a linked provider account. */
function accountKey(account: Account): string {
  return `${account.providerId}:${account.accountId}`
}

/** Returns a privacy-preserving identifier for a registered passkey. */
function passkeyIdentifier(passkey: Passkey): string {
  return `****${passkey.credentialID.slice(-4)}`
}

/** Returns the current page URL without an expired OAuth linking error. */
function getAccountLinkCallbackUrl(): string {
  const callbackUrl = new URL(window.location.href)
  callbackUrl.searchParams.delete('error')
  return callbackUrl.toString()
}

/** Starts the provider OAuth flow and links it to the current account. */
async function handleLink(providerId: SocialProvider): Promise<void> {
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  try {
    const callbackURL = getAccountLinkCallbackUrl()
    await authClient.linkSocial({
      provider: providerId,
      callbackURL,
      errorCallbackURL: callbackURL,
    })
  } catch {
    errorMessage = m.account__link_error()
    isBusy = false
  }
}

/** Starts a social sign-in flow that upgrades the current guest session. */
async function handleGuestSocial(providerId: SocialProvider): Promise<void> {
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  try {
    await signIn.social({
      provider: providerId,
      callbackURL: getAccountLinkCallbackUrl(),
    })
  } catch {
    errorMessage = m.guest__auth_generic_error()
    isBusy = false
  }
}

/** Creates an account or signs in, preserving the current guest session's state. */
async function handleGuestEmailSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy) return
  if (!isGuestSignIn && !emailAccountName.trim()) {
    errorMessage = m.guest__name_required()
    return
  }

  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result = isGuestSignIn
      ? await signIn.email({
          email,
          password: newPassword,
          callbackURL: window.location.href,
        })
      : await signUp.email({
          email,
          password: newPassword,
          name: emailAccountName.trim(),
          callbackURL: window.location.href,
        })
    if (result.error) throw new Error(result.error.message)
    if (isGuestSignIn) {
      window.location.reload()
      return
    }
    statusMessage = m.guest__verification_sent()
    newPassword = ''
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

/** Unlinks a provider while keeping at least one sign-in method available. */
async function handleUnlink(account: Account): Promise<void> {
  if (isBusy || accounts.length <= 1) return
  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result = await authClient.unlinkAccount({
      providerId: account.providerId,
      accountId: account.accountId,
    })
    if (result.error) throw new Error(result.error.message)
    accounts = accounts.filter(item => item.accountId !== account.accountId)
    const { [accountKey(account)]: _removedEmail, ...remainingProviderEmails } =
      providerEmails
    providerEmails = remainingProviderEmails
    statusMessage = m.account__account_unlinked()
  } catch {
    errorMessage = m.account__unlink_error()
  } finally {
    isBusy = false
  }
}

/** Adds email/password sign-in without creating another user account. */
async function handlePasswordSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy || accounts.some(account => account.providerId === 'credential')) return
  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, newPassword }),
    })
    if (!response.ok) throw new Error('password not set')
    newPassword = ''
    // The endpoint may have changed the email too, so replace the session atom's cached user.
    await useSession().get().refetch()
    await loadAccounts()
    showEmailSetup = false
    statusMessage = m.account__password_added()
  } catch {
    errorMessage = m.account__password_add_error()
  } finally {
    isBusy = false
  }
}
</script>

<section in:slide={{ duration: 220 }} class="border-b border-base-content/15 p-4">
  {#if isGuest}
    {#if !startGuestUpgradeOpen}
      <div class="flex flex-col items-center text-center">
        <div class="flex w-full items-center justify-between">
          <h2
            class="text-sm font-semibold uppercase tracking-wide text-base-content/65"
          >
            {m.guest__guest_account()}
          </h2>
          <button
            class="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-content transition hover:bg-primary/90"
            type="button"
            aria-expanded={isEditing}
            onclick={() => {
                isEditing = !isEditing
                errorMessage = ''
                statusMessage = ''
              }}
          >
            {m.guest__upgrade_title()}
          </button>
        </div>
      </div>
    {/if}

    {#if isEditing}
      <div
        class={`flex flex-col gap-4 ${
            startGuestUpgradeOpen ? '' : 'mt-4 border-t border-base-content/10 pt-4'
          }`}
      >
        <div class="flex flex-col gap-2">
          <h3 class="text-center text-sm font-medium text-base-content/70">
            {isGuestSignIn
                ? m.guest__sign_in_social_account()
                : m.guest__linked_account()}
          </h3>
          <div class="flex flex-wrap justify-center gap-2">
            {#each socialProviders as provider (provider.id)}
              {@const ProviderIcon = provider.icon}
              <button
                class="flex items-center gap-2 rounded border border-base-content/20 px-2 py-1 text-sm disabled:opacity-50"
                type="button"
                disabled={isBusy}
                onclick={() => handleGuestSocial(provider.id)}
              >
                <ProviderIcon
                  class={`h-4 w-4 ${provider.id === 'facebook' ? 'text-[#1877f2]' : ''}`}
                />{provider.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-center text-sm font-medium text-base-content/70">
            {isGuestSignIn
                ? m.guest__sign_in_standard_method()
                : m.guest__login_methods()}
          </h3>
          <div class="flex flex-wrap justify-center gap-2">
            {#if !showEmailSetup}
              <button
                class="flex items-center gap-2 rounded border border-base-content/20 px-2 py-1 text-sm disabled:opacity-50"
                type="button"
                disabled={isBusy}
                onclick={() => {
                    showEmailSetup = true
                    showPasskeySetup = false
                  }}
              >
                <Mail class="h-4 w-4" />{m.account__email()}
              </button>
            {/if}
            {#if !showPasskeySetup}
              <button
                class="flex items-center gap-2 rounded border border-base-content/20 px-2 py-1 text-sm disabled:opacity-50"
                type="button"
                disabled={isBusy}
                onclick={() => {
                    if (isGuestSignIn) {
                      void handleGuestPasskeySignIn()
                    } else {
                      showPasskeySetup = true
                      showEmailSetup = false
                    }
                  }}
              >
                <KeyRound class="h-4 w-4" />
                {isGuestSignIn
                    ? m.account__passkey()
                    : m.account__setup_passkey()}
              </button>
            {/if}
          </div>
        </div>

        {#if showEmailSetup}
          <form class="mt-2 flex flex-col gap-2" onsubmit={handleGuestEmailSubmit}>
            {#if !isGuestSignIn}
              <label class="text-sm" for="guest-account-name"
                >{m.guest__preferred_name()}</label
              >
              <input
                id="guest-account-name"
                class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
                type="text"
                autocomplete="name"
                bind:value={emailAccountName}
                required
              >
            {/if}
            <label class="text-sm" for="guest-account-email">{m.guest__email()}</label>
            <input
              id="guest-account-email"
              class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
              type="email"
              autocomplete="email"
              bind:value={email}
              required
            >
            <label class="text-sm" for="guest-account-password"
              >{m.guest__password()}</label
            >
            <input
              id="guest-account-password"
              class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
              type="password"
              autocomplete={isGuestSignIn ? 'current-password' : 'new-password'}
              minlength="8"
              maxlength="128"
              bind:value={newPassword}
              required
            >
            <button
              class="mt-3 self-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content disabled:opacity-50"
              type="submit"
              disabled={isBusy}
            >
              {isGuestSignIn ? m.guest__sign_in() : m.guest__create_account()}
            </button>
          </form>
        {/if}
        {#if showPasskeySetup}
          <form class="flex flex-col gap-2" onsubmit={handleGuestPasskeySubmit}>
            <h4 class="text-center text-sm font-medium text-base-content/70">
              {m.guest__passkey_setup_title()}
            </h4>
            <p class="text-center text-sm text-base-content/65">
              {m.guest__passkey_setup_description()}
            </p>
            <label class="text-sm" for="guest-passkey-name"
              >{m.guest__preferred_name()}</label
            >
            <input
              id="guest-passkey-name"
              class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
              type="text"
              autocomplete="name"
              bind:value={preferredName}
            >
            <label class="text-sm" for="guest-passkey-username"
              >{m.guest__preferred_username()}</label
            >
            <input
              id="guest-passkey-username"
              class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
              type="text"
              autocomplete="username"
              maxlength="32"
              bind:value={preferredUsername}
            >
            <label class="text-sm" for="guest-passkey-email"
              >{m.guest__email_optional()}</label
            >
            <input
              id="guest-passkey-email"
              class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
              type="email"
              autocomplete="email"
              bind:value={preferredEmail}
            >
            <button
              class="mt-3 self-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content disabled:opacity-50"
              type="submit"
              disabled={isBusy}
            >
              {m.account__setup_passkey()}
            </button>
          </form>
        {/if}
        {#if errorMessage}
          <p
            role="alert"
            transition:slide={{ duration: 220 }}
            class="text-center text-sm text-error"
          >
            {errorMessage}
          </p>
        {/if}
        {#if statusMessage}
          <p
            role="status"
            transition:slide={{ duration: 220 }}
            class="text-center text-sm text-success"
          >
            {statusMessage}
          </p>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="flex flex-col gap-4">
      {#if isLoading}
        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-base-content/70">
            {m.account__social_accounts()}
          </h3>
          {#each socialProviders as provider (provider.id)}
            {@const ProviderIcon = provider.icon}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 flex-1 items-center gap-2.5"
                ><ProviderIcon
                  class={provider.id === 'facebook' ? 'h-5 w-5 text-[#1877F2]' : 'h-5 w-5'}
                /><span class="text-base-content">{provider.label}</span></span
              >
              <span
                aria-busy="true"
                class="h-8 w-12 shrink-0 animate-pulse rounded border border-base-content/10 bg-base-content/10"
                ><span class="sr-only">Loading linked sign-in methods</span></span
              >
            </div>
          {/each}
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-base-content/70">
            {m.account__standard_login_methods()}
          </h3>
          {#each [
              { label: m.account__email(), icon: Mail },
              { label: m.account__passkey(), icon: KeyRound },
            ] as method (method.label)}
            {@const MethodIcon = method.icon}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 flex-1 items-center gap-2.5"
                ><MethodIcon class="h-4 w-4" />
                <span class="text-base-content">{method.label}</span></span
              >
              <span
                aria-busy="true"
                class="h-8 w-12 shrink-0 animate-pulse rounded border border-base-content/10 bg-base-content/10"
                ><span class="sr-only">Loading linked sign-in methods</span></span
              >
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-base-content/70">
            {m.account__social_accounts()}
          </h3>
          {#each accounts.filter(account => account.providerId !== 'credential') as account (account.accountId)}
            {@const Icon = providerIcon(account.providerId)}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 flex-1 items-center gap-2.5"
                ><Icon
                  class={account.providerId === 'facebook' ? 'h-5 w-5 text-[#1877F2]' : 'h-5 w-5'}
                /><span class="min-w-0 text-base-content"
                  >{providerLabel(account.providerId)}
                  {#if providerEmails[accountKey(account)]}
                    <span class="text-base-content/55"
                      >({providerEmails[accountKey(account)]})</span
                    >
                  {/if}</span
                ></span
              >
              <button
                class="shrink-0 rounded border border-error/40 px-2 py-1 text-error transition hover:bg-error/10 disabled:opacity-40"
                type="button"
                disabled={isBusy || accounts.length <= 1}
                onclick={() => handleUnlink(account)}
              >
                {m.account__unlink()}
              </button>
            </div>
          {/each}
          {#each socialProviders as provider (provider.id)}
            {@const ProviderIcon = provider.icon}
            {#if !accounts.some(account => account.providerId === provider.id)}
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="flex min-w-0 flex-1 items-center gap-2.5"
                  ><ProviderIcon
                    class={provider.id === 'facebook' ? 'h-5 w-5 text-[#1877F2]' : 'h-5 w-5'}
                  /><span class="text-base-content">{provider.label}</span></span
                >
                <button
                  class="shrink-0 rounded border border-base-content/20 px-2 py-1 text-base-content transition hover:bg-base-content/10 disabled:opacity-40"
                  type="button"
                  disabled={isBusy}
                  onclick={() => handleLink(provider.id)}
                >
                  {m.account__link()}
                </button>
              </div>
            {/if}
          {/each}
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-base-content/70">
            {m.account__standard_login_methods()}
          </h3>
          {#each accounts.filter(account => account.providerId === 'credential') as account (account.accountId)}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 flex-1 items-center gap-2.5"
                ><Mail class="h-5 w-5" />
                <span class="min-w-0 text-base-content"
                  >{m.account__email()}
                  {#if linkedAccountLabel}
                    <span class="text-base-content/55">({linkedAccountLabel})</span>
                  {/if}</span
                ></span
              >
              <button
                class="shrink-0 rounded border border-error/40 px-2 py-1 text-error transition hover:bg-error/10 disabled:opacity-40"
                type="button"
                disabled={isBusy || accounts.length <= 1}
                onclick={() => handleUnlink(account)}
              >
                {m.account__unlink()}
              </button>
            </div>
          {/each}
          {#if passkeys.length}
            {#each passkeys as passkey (passkey.id)}
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="flex min-w-0 flex-1 items-center gap-2.5"
                  ><KeyRound class="h-4 w-4" />
                  <span class="min-w-0 text-base-content"
                    >{m.account__passkey()}
                    <span class="text-base-content/55"
                      >({passkeyIdentifier(passkey)})</span
                    ></span
                  ></span
                >
                <button
                  class="shrink-0 rounded border border-error/40 px-2 py-1 text-error transition hover:bg-error/10 disabled:opacity-40"
                  type="button"
                  disabled={isBusy || (accounts.length === 0 && passkeys.length <= 1)}
                  onclick={() => handleRemovePasskey(passkey)}
                >
                  {m.account__unlink()}
                </button>
              </div>
            {/each}
          {:else}
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2.5"
                ><KeyRound class="h-4 w-4" />{m.account__passkey()}</span
              >
              <button
                class="rounded border border-base-content/20 px-2 py-1 text-base-content transition hover:bg-base-content/10 disabled:opacity-40"
                type="button"
                disabled={isBusy}
                onclick={handleAddPasskey}
              >
                {m.account__setup_passkey()}
              </button>
            </div>
          {/if}
          {#if !accounts.some(account => account.providerId === 'credential') && !showEmailSetup}
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 flex-1 items-center gap-2.5"
                ><Mail class="h-5 w-5" />
                <span class="text-base-content">{m.account__email()}</span></span
              >
              <button
                class="shrink-0 rounded border border-base-content/20 px-2 py-1 text-base-content transition hover:bg-base-content/10 disabled:opacity-40"
                type="button"
                disabled={isBusy}
                onclick={() => (showEmailSetup = true)}
              >
                {m.account__add_password_action()}
              </button>
            </div>
          {/if}

          {#if !accounts.some(account => account.providerId === 'credential') && showEmailSetup}
            <form class="mt-2 flex flex-col gap-2" onsubmit={handlePasswordSubmit}>
              <label class="text-sm" for="profile-account-email"
                >{m.guest__email()}</label
              >
              <input
                id="profile-account-email"
                class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
                type="email"
                autocomplete="email"
                bind:value={email}
                required
              >
              <label class="text-sm" for="profile-account-password"
                >{m.guest__password()}</label
              >
              <input
                id="profile-account-password"
                class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
                type="password"
                autocomplete="new-password"
                minlength="8"
                maxlength="128"
                bind:value={newPassword}
                required
              >
              <button
                class="mt-3 min-w-52 self-center rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-content disabled:opacity-50"
                type="submit"
                disabled={isBusy}
              >
                {m.account__setup_email_login()}
              </button>
            </form>
          {/if}
          {#if errorMessage}
            <p
              role="alert"
              transition:slide={{ duration: 220 }}
              class="text-center text-sm text-error"
            >
              {errorMessage}
            </p>
          {/if}
          {#if statusMessage}
            <p
              role="status"
              transition:slide={{ duration: 220 }}
              class="text-center text-sm text-success"
            >
              {statusMessage}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>
