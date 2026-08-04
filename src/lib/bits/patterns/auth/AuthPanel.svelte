<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { fade } from 'svelte/transition'

// ICONS
import Mail from 'virtual:icons/lucide/mail'
import KeyRound from 'virtual:icons/lucide/key-round'
// AUTH
import { authClient, signIn, signUp } from '$lib/auth/client'
import { toSafeReturnPath } from '$lib/auth/upgrade'
import { isAuthProviderEnabled, type AuthProviderId } from '$lib/auth/providers'
// COMPONENTS
import AuthSocialButtons from './AuthSocialButtons.svelte'
import AuthTextField from './AuthTextField.svelte'
// I18N
import { m } from '$lib/i18n'

let {
  title = m.guest__upgrade_title(),
  description = '',
  returnTo = '/',
  showGuest = false,
  showAuthModeTitle = false,
  authMode = 'sign-in',
  brandName = 'HYPE',
  modeToggleHref = '',
  authPath = '/login',
  onModeChange,
  onGuest,
}: {
  title?: string
  description?: string
  returnTo?: string
  showGuest?: boolean
  showAuthModeTitle?: boolean
  authMode?: 'sign-in' | 'sign-up'
  brandName?: string
  modeToggleHref?: string
  authPath?: '/login' | '/signup'
  onModeChange?: (mode: 'sign-in' | 'sign-up') => void
  onGuest?: () => void | Promise<void>
} = $props()

let email = $state('')
let password = $state('')
let name = $state('')
let observedAuthMode: 'sign-in' | 'sign-up' | undefined
const mode = $derived(authMode)
let isBusy = $state(false)
let errorMessage = $state('')
let statusMessage = $state('')
let isAwaitingVerification = $state(false)
let verificationEmail = $state('')
let showEmailAuth = $state(false)
let showPasskeySignUp = $state(false)
let preferredName = $state('')
let preferredUsername = $state('')
let preferredEmail = $state('')

const safeCallbackUrl = $derived(toSafeReturnPath(returnTo))
const authTitle = $derived(
  showAuthModeTitle
    ? mode === 'sign-up'
      ? m.login__sign_up_title({ brandName })
      : m.login__sign_in_title({ brandName })
    : title,
)
const oauthErrorMessage = $derived(
  page.url.searchParams.get('error') === 'account_not_linked'
    ? m.account__social_account_not_linked()
    : '',
)

$effect(() => {
  if (oauthErrorMessage) errorMessage = oauthErrorMessage
})

// Changing routes may preserve this component through shallow navigation.
$effect(() => {
  if (observedAuthMode && observedAuthMode !== mode) {
    errorMessage = ''
    statusMessage = ''
    isAwaitingVerification = false
    verificationEmail = ''
    if (showPasskeySignUp) showEmailAuth = false
    showPasskeySignUp = false
  }
  observedAuthMode = mode
})

/** Keeps ordinary clicks within the auth shell while preserving standard link behavior. */
function handleModeToggle(event: MouseEvent): void {
  if (
    !onModeChange ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }

  event.preventDefault()
  onModeChange(mode === 'sign-in' ? 'sign-up' : 'sign-in')
}

async function handleSocial(providerId: AuthProviderId): Promise<void> {
  if (providerId === 'email' || !isAuthProviderEnabled(providerId) || isBusy) return
  isBusy = true
  errorMessage = ''
  try {
    await signIn.social({
      provider: providerId,
      callbackURL: safeCallbackUrl,
      errorCallbackURL: `${window.location.origin}${authPath}?returnTo=${encodeURIComponent(safeCallbackUrl)}`,
    })
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

async function handleEmailSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy) return
  if (mode === 'sign-up' && !name.trim()) {
    errorMessage = m.guest__name_required()
    return
  }

  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result =
      mode === 'sign-up'
        ? await signUp.email({
            email,
            password,
            name: name.trim(),
            callbackURL: safeCallbackUrl,
          })
        : await signIn.email({ email, password, callbackURL: safeCallbackUrl })

    if (result.error) {
      errorMessage = m.guest__auth_generic_error()
      return
    }

    if (mode === 'sign-up') {
      verificationEmail = email.trim()
      isAwaitingVerification = true
      statusMessage = m.guest__verification_sent()
      return
    }

    await goto(safeCallbackUrl)
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

async function handleGuest(): Promise<void> {
  if (isBusy || !onGuest) return
  isBusy = true
  errorMessage = ''
  try {
    await onGuest()
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

/** Signs in with a passkey registered to an existing HYPE account. */
async function handlePasskey(): Promise<void> {
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  try {
    const result = await signIn.passkey({})
    if (result.error) {
      errorMessage = m.guest__auth_generic_error()
      return
    }
    await goto(safeCallbackUrl)
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

/** Opens email/password authentication for the currently selected mode. */
function openEmailAuth(): void {
  showPasskeySignUp = false
  showEmailAuth = true
  errorMessage = ''
  statusMessage = ''
  isAwaitingVerification = false
  verificationEmail = ''
}

/** Opens passkey account creation with optional profile details prefilled from email sign-up. */
function openPasskeySignUp(): void {
  showEmailAuth = true
  showPasskeySignUp = true
  preferredEmail = email.trim()
  errorMessage = ''
  statusMessage = ''
  isAwaitingVerification = false
  verificationEmail = ''
}

/** Starts the passkey flow appropriate to the selected authentication mode. */
function handlePasskeyAction(): void {
  if (mode === 'sign-up') {
    openPasskeySignUp()
    return
  }

  void handlePasskey()
}

/** Reuses an existing passkey so a retry can finish a partially completed setup. */
async function ensurePasskeyForCurrentUser(): Promise<void> {
  const existingPasskeys = await authClient.passkey.listUserPasskeys()
  if (existingPasskeys.error) throw new Error(existingPasskeys.error.message)
  if (existingPasskeys.data?.length) return

  const passkeyResult = await authClient.passkey.addPasskey({ name: 'HYPE passkey' })
  if (passkeyResult.error) throw new Error(passkeyResult.error.message)
}

/** Registers a passkey and promotes a temporary guest session into an account. */
async function handlePasskeySignUp(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy) return

  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const sessionResult = await authClient.getSession()
    if (!sessionResult.data?.user) {
      const guestResult = await signIn.anonymous()
      if (guestResult.error) throw new Error(guestResult.error.message)
    }

    // Save optional profile data before creating a durable sign-in credential.
    const profile: { name?: string; username?: string } = {}
    if (preferredName.trim()) profile.name = preferredName.trim()
    if (preferredUsername.trim()) profile.username = preferredUsername.trim()
    if (Object.keys(profile).length > 0) {
      const profileResult = await authClient.updateUser(profile)
      if (profileResult.error) throw new Error(profileResult.error.message)
    }

    // A retry can promote a guest that already registered its passkey in an earlier attempt.
    await ensurePasskeyForCurrentUser()

    // The server verifies the new credential before making the guest account durable.
    const promotionResponse = await fetch('/api/account/passkey', { method: 'POST' })
    if (!promotionResponse.ok) throw new Error('account not upgraded')

    if (preferredEmail.trim()) {
      const emailResult = await authClient.changeEmail({
        newEmail: preferredEmail.trim(),
        callbackURL: window.location.href,
      })
      if (emailResult.error) throw new Error(emailResult.error.message)
    }

    await authClient.getSession()
    await goto(safeCallbackUrl)
  } catch {
    errorMessage = m.account__passkey_add_error()
  } finally {
    isBusy = false
  }
}

async function handleVerificationResend(): Promise<void> {
  if (isBusy || !verificationEmail) return
  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    await authClient.sendVerificationEmail({
      email: verificationEmail,
      callbackURL: safeCallbackUrl,
    })
    statusMessage = m.guest__verification_resent()
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

async function handlePasswordResetRequest(): Promise<void> {
  if (isBusy) return
  errorMessage = ''
  statusMessage = ''
  if (!email.trim()) {
    errorMessage = m.guest__email_required()
    return
  }
  isBusy = true
  try {
    await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/account/reset-password`,
    })
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    statusMessage = m.guest__password_reset_requested()
    isBusy = false
  }
}
</script>

<section
  class="w-full max-w-xl rounded-2xl border border-white/15 bg-neutral-950/95 p-6 text-white shadow-2xl"
>
  {#if showAuthModeTitle && modeToggleHref}
    <div class="flex items-center justify-center gap-3">
      <h1 class="shrink-0 whitespace-nowrap text-center text-2xl font-semibold">
        {authTitle}
      </h1>
      <span class="h-7 border-l border-white/30" aria-hidden="true"></span>
      <a
        class="shrink-0 whitespace-nowrap text-lg font-medium text-white/70 underline-offset-4 transition hover:text-white hover:underline"
        href={modeToggleHref}
        onclick={handleModeToggle}
      >
        {mode === 'sign-in' ? m.login__sign_up_action() : m.guest__sign_in()}
      </a>
    </div>
  {:else}
    <h1 class="text-center text-2xl font-semibold">{authTitle}</h1>
  {/if}
  {#if description && !showEmailAuth}
    <p class="mt-2 text-center text-sm leading-6 text-white/70">{description}</p>
  {/if}
  {#if errorMessage}
    <p class="mt-4 text-center text-sm text-red-300">{errorMessage}</p>
  {/if}
  {#if statusMessage}
    <p class="mt-4 text-center text-sm text-emerald-300">{statusMessage}</p>
  {/if}

  {#if !showEmailAuth}
    <div class="mt-6 grid grid-cols-2 gap-3">
      <AuthSocialButtons disabled={isBusy} onSelect={handleSocial} />

      <button
        class="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white/40 hover:bg-white/5 hover:text-white"
        type="button"
        aria-expanded={showEmailAuth}
        onclick={openEmailAuth}
      >
        <Mail class="h-5 w-5 text-white/70" />
        {m.guest__email()}
      </button>
      <button
        class="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white hover:bg-white/5 disabled:opacity-40"
        type="button"
        disabled={isBusy}
        onclick={handlePasskeyAction}
      >
        <KeyRound class="h-5 w-5 text-white/70" />
        {m.account__passkey()}
      </button>
    </div>

    {#if showGuest}
      <div class="mt-3 flex flex-col items-center">
        <div class="h-1 border-l border-white/20" aria-hidden="true"></div>
        <span class="py-1 text-xs font-medium tracking-[0.2em] text-white/50">OR</span>
        <div class="mb-3 h-1 border-l border-white/20" aria-hidden="true"></div>
        <button
          class="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
          type="button"
          disabled={isBusy}
          onclick={handleGuest}
        >
          {m.guest__continue_as_guest()}
        </button>
        <p class="mt-2 text-center text-xs text-white/45">
          {m.login__guest_limitation()}
        </p>
      </div>
    {/if}
  {:else}
    <div class="mt-4" in:fade={{ duration: 180 }}>
      {#if showPasskeySignUp}
        <form class="flex flex-col gap-3" onsubmit={handlePasskeySignUp}>
          <p class="whitespace-pre-line text-center text-sm text-white/65">
            {m.guest__passkey_setup_description()}
          </p>
          <AuthTextField
            label={m.guest__preferred_name()}
            autocomplete="name"
            bind:value={preferredName}
          />
          <AuthTextField
            label={m.guest__preferred_username()}
            autocomplete="username"
            maxlength={32}
            bind:value={preferredUsername}
          />
          <AuthTextField
            label={m.guest__email_optional()}
            type="email"
            autocomplete="email"
            bind:value={preferredEmail}
          />
          <button
            class="mt-3 min-w-40 self-center whitespace-nowrap rounded-lg bg-[#4987E2] px-4 py-2 font-medium text-white transition hover:bg-[#4987E2]/90 disabled:opacity-50"
            type="submit"
            disabled={isBusy}
          >
            {m.account__setup_passkey()}
          </button>
        </form>
      {:else}
        <form class="flex flex-col gap-3" onsubmit={handleEmailSubmit}>
          {#if mode === 'sign-up'}
            <AuthTextField
              label={m.field_name()}
              autocomplete="name"
              required
              bind:value={name}
            />
          {/if}
          <AuthTextField
            label={m.guest__email()}
            type="email"
            autocomplete="email"
            required
            bind:value={email}
          />
          <AuthTextField
            label={m.guest__password()}
            type="password"
            autocomplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            minlength={8}
            maxlength={128}
            required
            bind:value={password}
          />
          <button
            class="mt-3 min-w-40 self-center whitespace-nowrap rounded-lg bg-[#4987E2] px-4 py-2 font-medium text-white transition hover:bg-[#4987E2]/90 disabled:opacity-50"
            type="submit"
            disabled={isBusy}
          >
            {mode === 'sign-up' ? m.guest__create_account() : m.guest__sign_in()}
          </button>
        </form>
      {/if}
      {#if mode === 'sign-in' && !showPasskeySignUp}
        <div class="mt-4 flex justify-center">
          <button
            type="button"
            class="text-sm text-white/65 underline"
            onclick={handlePasswordResetRequest}
          >
            {m.guest__forgot_password()}
          </button>
        </div>
      {/if}
      {#if isAwaitingVerification && !showPasskeySignUp}
        <div class="mt-3 flex justify-center">
          <button
            class="text-sm text-white/65 underline"
            type="button"
            disabled={isBusy}
            onclick={handleVerificationResend}
          >
            {m.guest__resend_verification()}
          </button>
        </div>
      {/if}
      <footer class="mt-6 border-t border-white/10 text-center">
        {#if showPasskeySignUp}
          <p class="mt-4 text-xs uppercase tracking-[0.16em] text-white/45">
            {m.login__or_sign_up_with()}
          </p>
          <div class="mt-3 flex justify-center gap-3">
            <AuthSocialButtons compact disabled={isBusy} onSelect={handleSocial} />
            <button
              class="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 transition hover:border-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              aria-label={m.account__email()}
              title={m.account__email()}
              disabled={isBusy}
              onclick={openEmailAuth}
            >
              <Mail class="h-4 w-4" />
            </button>
          </div>
        {:else}
          <p class="mt-5 text-xs uppercase tracking-[0.16em] text-white/45">
            {mode === 'sign-up' ? m.login__or_sign_up_with() : m.login__or_login_with()}
          </p>
          <div class="mt-3 flex justify-center gap-3">
            <AuthSocialButtons compact disabled={isBusy} onSelect={handleSocial} />
          </div>
          <button
            class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white/40 disabled:opacity-40"
            type="button"
            disabled={isBusy}
            onclick={handlePasskeyAction}
          >
            <KeyRound class="h-4 w-4" />{m.account__passkey()}
          </button>
        {/if}
      </footer>
    </div>
  {/if}
</section>
