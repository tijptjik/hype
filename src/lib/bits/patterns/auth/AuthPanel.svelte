<script lang="ts">
// SVELTEKIT
import { page } from '$app/state'
// SVELTE
import { fade } from 'svelte/transition'

// ICONS
import Mail from 'virtual:icons/proicons/mail'
import KeyRound from 'virtual:icons/proicons/key'
import LoaderCircle from 'virtual:icons/proicons/spinner'
// AUTH
import { authClient, signIn, signUp } from '#lib/auth/client.js'
import {
  completePasskeyAccountUpgrade,
  PasskeySessionRefreshError,
} from '#lib/auth/passkey-upgrade.js'
import { toSafeReturnPath } from '#lib/auth/upgrade.js'
import { navigateAfterAuth } from '#lib/auth/navigation.js'
import { isAuthProviderEnabled, type AuthProviderId } from '#lib/auth/providers.js'
// COMPONENTS
import AuthSocialButtons from './AuthSocialButtons.svelte'
import AuthTextField from './AuthTextField.svelte'
// I18N
import { m } from '#lib/i18n.js'

let {
  title = m.guest__upgrade_title(),
  description = '',
  returnTo = '/',
  showGuest = false,
  showAuthModeTitle = false,
  authMode = 'sign-in',
  authModeTitle,
  authModeToggleLabel,
  brandName = 'HYPE',
  modeToggleHref = '',
  authPath = '/signin',
  onModeChange,
  onGuest,
  onSignUpComplete,
  onPasskeyAccountComplete,
}: {
  title?: string
  description?: string
  returnTo?: string
  showGuest?: boolean
  showAuthModeTitle?: boolean
  authMode?: 'sign-in' | 'sign-up'
  authModeTitle?: string
  authModeToggleLabel?: string
  brandName?: string
  modeToggleHref?: string
  authPath?: '/signin' | '/signup'
  onModeChange?: (mode: 'sign-in' | 'sign-up') => void
  onGuest?: () => void | Promise<void>
  onSignUpComplete?: (email: string) => void
  onPasskeyAccountComplete?: () => void | Promise<void>
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
let isFinishingPasskeySetup = $state(false)
let preferredName = $state('')
let preferredUsername = $state('')
let preferredEmail = $state('')

const safeCallbackUrl = $derived(toSafeReturnPath(returnTo))
const authTitle = $derived(
  showAuthModeTitle
    ? (authModeTitle ??
        (mode === 'sign-up'
          ? m.login__sign_up_title({ brandName })
          : m.login__sign_in_title({ brandName })))
    : title,
)
const modeToggleLabel = $derived(
  authModeToggleLabel ??
    (mode === 'sign-in' ? m.login__sign_up_action() : m.guest__sign_in()),
)
const oauthErrorCode = $derived(page.url.searchParams.get('error'))
const oauthErrorMessage = $derived(
  oauthErrorCode === 'BREADLINE_EMAIL_VERIFICATION_REQUIRED'
    ? m.guest__breadline_email_required()
    : oauthErrorCode === 'account_not_linked'
      ? m.account__social_account_not_linked()
      : oauthErrorCode
        ? m.guest__auth_generic_error()
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
    isFinishingPasskeySetup = false
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
  const normalizedEmail = email.trim()
  try {
    const result =
      mode === 'sign-up'
        ? await signUp.email({
            email: normalizedEmail,
            password,
            name: name.trim(),
            callbackURL: safeCallbackUrl,
          })
        : await signIn.email({
            email: normalizedEmail,
            password,
            callbackURL: safeCallbackUrl,
          })

    if (result.error) {
      if (String(result.error.code) === 'BREADLINE_EMAIL_VERIFICATION_REQUIRED') {
        errorMessage = m.guest__breadline_email_required()
        return
      }
      if (mode === 'sign-in' && result.error.code === 'EMAIL_NOT_VERIFIED') {
        verificationEmail = normalizedEmail
        isAwaitingVerification = true
        statusMessage = m.guest__email_verification_required()
        return
      }
      errorMessage = m.guest__auth_generic_error()
      return
    }

    if (mode === 'sign-up') {
      if (onSignUpComplete) {
        onSignUpComplete(normalizedEmail)
        return
      }
      verificationEmail = normalizedEmail
      isAwaitingVerification = true
      statusMessage = m.guest__verification_sent()
      return
    }

    await navigateAfterAuth(safeCallbackUrl)
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
    await navigateAfterAuth(safeCallbackUrl)
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
  isFinishingPasskeySetup = false
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

/** Registers a passkey and promotes a temporary guest session into an account. */
async function handlePasskeySignUp(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy) return

  isBusy = true
  errorMessage = ''
  statusMessage = ''
  isFinishingPasskeySetup = false
  try {
    const sessionResult = await authClient.getSession()
    const sessionUser = sessionResult.data?.user
    if (sessionUser && sessionUser.isAnonymous !== true) {
      throw new Error('current session is not anonymous')
    }

    if (!sessionUser) {
      const guestResult = await signIn.anonymous()
      if (guestResult.error) throw new Error(guestResult.error.message)
    }

    await completePasskeyAccountUpgrade({
      name: preferredName,
      username: preferredUsername,
      email: preferredEmail,
      emailCallbackUrl: window.location.href,
      onPasskeyReady: () => {
        isFinishingPasskeySetup = true
        statusMessage = m.guest__passkey_finishing_setup()
      },
    })

    if (onPasskeyAccountComplete) {
      await onPasskeyAccountComplete()
      return
    }

    await navigateAfterAuth(safeCallbackUrl)
  } catch (error) {
    statusMessage = ''
    errorMessage =
      error instanceof PasskeySessionRefreshError
        ? m.account__passkey_session_refresh_error()
        : isFinishingPasskeySetup
          ? m.account__passkey_setup_error()
          : m.account__passkey_add_error()
  } finally {
    isBusy = false
    isFinishingPasskeySetup = false
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

/**
 * Requests a one-time email login without disclosing imported-account eligibility.
 * @returns Nothing after showing delivery feedback or an actionable failure.
 */
async function handleEmailLink(): Promise<void> {
  if (isBusy) return
  errorMessage = ''
  statusMessage = ''
  if (!email.trim()) {
    errorMessage = m.guest__email_required()
    return
  }
  isBusy = true
  try {
    const result = await signIn.magicLink({
      email: email.trim(),
      callbackURL: safeCallbackUrl,
    })
    if (result.error) {
      errorMessage = m.guest__auth_generic_error()
      return
    }
    statusMessage = m.guest__sign_in_link_sent()
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
  class="border-border bg-panel/95 text-foreground w-[27rem] max-w-[calc(100vw-2rem)] rounded-2xl border p-6 shadow-2xl"
>
  {#if showAuthModeTitle && (modeToggleHref || onModeChange)}
    <div class="flex items-center justify-center gap-3">
      <h1 class="shrink-0 text-center text-2xl font-semibold whitespace-nowrap">
        {authTitle}
      </h1>
      <span class="border-border h-7 border-l" aria-hidden="true"></span>
      {#if modeToggleHref}
        <a
          class="text-muted-foreground hover:text-foreground shrink-0 text-lg font-medium whitespace-nowrap underline-offset-4 transition hover:underline"
          href={modeToggleHref}
          onclick={handleModeToggle}
        >
          {modeToggleLabel}
        </a>
      {:else}
        <button
          class="text-muted-foreground hover:text-foreground shrink-0 text-lg font-medium whitespace-nowrap underline-offset-4 transition hover:underline"
          type="button"
          onclick={() => onModeChange?.(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        >
          {modeToggleLabel}
        </button>
      {/if}
    </div>
  {:else}
    <h1 class="text-center text-2xl font-semibold">{authTitle}</h1>
  {/if}
  {#if description && !showEmailAuth}
    <p class="text-muted-foreground mt-2 text-center text-sm leading-6">
      {description}
    </p>
  {/if}
  {#if errorMessage}
    <p class="text-error mt-4 text-center text-sm whitespace-pre-line">
      {errorMessage}
    </p>
  {/if}
  {#if statusMessage}
    <p class="text-success mt-4 text-center text-sm" role="status">
      {statusMessage}
    </p>
  {/if}

  {#if !showEmailAuth}
    <div class="mt-6 grid grid-cols-2 gap-3">
      <AuthSocialButtons disabled={isBusy} onSelect={handleSocial} />

      <button
        class="border-border hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition"
        type="button"
        aria-expanded={showEmailAuth}
        onclick={openEmailAuth}
      >
        <Mail class="text-muted-foreground h-5 w-5" />
        {m.guest__email()}
      </button>
      <button
        class="border-border hover:border-foreground/40 hover:bg-foreground/5 col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition disabled:opacity-40"
        type="button"
        disabled={isBusy}
        onclick={handlePasskeyAction}
      >
        <KeyRound class="text-muted-foreground h-5 w-5" />
        {m.account__passkey()}
      </button>
    </div>

    {#if showGuest}
      <div class="mt-3 flex flex-col items-center">
        <div class="border-border h-1 border-l" aria-hidden="true"></div>
        <span
          class="text-muted-foreground py-1 text-xs font-medium tracking-[0.2em] uppercase"
          >{m.or()}</span
        >
        <div class="border-border mb-3 h-1 border-l" aria-hidden="true"></div>
        <button
          class="border-border bg-foreground/5 text-foreground hover:bg-foreground/5 w-full rounded-lg border px-4 py-2 font-medium transition disabled:opacity-50"
          type="button"
          disabled={isBusy}
          onclick={handleGuest}
        >
          {m.guest__continue_as_guest()}
        </button>
        <p class="text-muted-foreground mt-2 text-center text-xs">
          {m.login__guest_limitation()}
        </p>
      </div>
    {/if}
  {:else}
    <div class="mt-4" in:fade={{ duration: 180 }}>
      {#if showPasskeySignUp}
        <form class="flex flex-col gap-3" onsubmit={handlePasskeySignUp}>
          <p class="text-muted-foreground text-center text-sm whitespace-pre-line">
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
            class="bg-primary text-primary-content hover:bg-primary/90 mt-3 inline-flex min-w-40 items-center justify-center self-center rounded-lg px-4 py-2 font-medium whitespace-nowrap transition disabled:opacity-50"
            type="submit"
            disabled={isBusy}
            aria-busy={isBusy}
            aria-label={m.account__setup_passkey()}
          >
            {#if isBusy}
              <LoaderCircle class="h-5 w-5 animate-spin" aria-hidden="true" />
            {:else}
              {m.account__setup_passkey()}
            {/if}
          </button>
        </form>
      {:else}
        <form class="flex flex-col gap-3" onsubmit={handleEmailSubmit}>
          {#if mode === 'sign-up'}
            <AuthTextField
              label={m.guest__preferred_name()}
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
          <button
            type="button"
            disabled={isBusy}
            onclick={handleEmailLink}
            class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4 transition disabled:opacity-50"
          >
            {m.guest__email_sign_in_link()}
          </button>
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
            class="bg-primary text-primary-content hover:bg-primary/90 mt-3 min-w-40 self-center rounded-lg px-4 py-2 font-medium whitespace-nowrap transition disabled:opacity-50"
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
            class="text-muted-foreground text-sm underline"
            onclick={handlePasswordResetRequest}
          >
            {m.guest__forgot_password()}
          </button>
        </div>
      {/if}
      {#if isAwaitingVerification && !showPasskeySignUp}
        <div class="mt-3 flex justify-center">
          <button
            class="text-muted-foreground text-sm underline"
            type="button"
            disabled={isBusy}
            onclick={handleVerificationResend}
          >
            {m.guest__resend_verification()}
          </button>
        </div>
      {/if}
      <footer class="border-border mt-6 border-t text-center">
        {#if showPasskeySignUp}
          <p class="text-muted-foreground mt-4 text-xs tracking-[0.16em] uppercase">
            {m.login__or_sign_up_with()}
          </p>
          <div class="mt-3 flex justify-center gap-3">
            <AuthSocialButtons compact disabled={isBusy} onSelect={handleSocial} />
            <button
              class="border-border hover:border-foreground/40 hover:bg-foreground hover:text-canvas flex h-10 w-10 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              aria-label={m.account__email()}
              data-tooltip={m.account__email()}
              disabled={isBusy}
              onclick={openEmailAuth}
            >
              <Mail class="h-4 w-4" />
            </button>
          </div>
        {:else}
          <p class="text-muted-foreground mt-5 text-xs tracking-[0.16em] uppercase">
            {mode === 'sign-up' ? m.login__or_sign_up_with() : m.login__or_login_with()}
          </p>
          <div class="mt-3 flex justify-center gap-3">
            <AuthSocialButtons compact disabled={isBusy} onSelect={handleSocial} />
          </div>
          <button
            class="border-border hover:border-foreground/40 mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition disabled:opacity-40"
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
