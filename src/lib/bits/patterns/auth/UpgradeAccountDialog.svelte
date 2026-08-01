<script lang="ts">
// SVELTE
import { Dialog } from 'bits-ui'
import Apple from 'virtual:icons/simple-icons/apple'
import Google from 'virtual:icons/logos/google-icon'
import Wechat from 'virtual:icons/simple-icons/wechat'
import Mail from 'virtual:icons/lucide/mail'
// AUTH
import { authClient, signIn, signUp } from '$lib/auth/client'
import { toSafeReturnPath, type UpgradeReason } from '$lib/auth/upgrade'
import { AUTH_PROVIDER_REGISTRY } from '$lib/auth/providers'
// I18N
import { m } from '$lib/i18n'

let {
  open = $bindable(false),
  reason = 'account',
  returnTo = '/',
}: {
  open?: boolean
  reason?: UpgradeReason
  returnTo?: string
} = $props()

let email = $state('')
let password = $state('')
let mode = $state<'sign-in' | 'sign-up'>('sign-up')
let isBusy = $state(false)
let errorMessage = $state('')
let statusMessage = $state('')
let isAwaitingVerification = $state(false)
let showEmailAuth = $state(false)

const safeCallbackUrl = $derived(toSafeReturnPath(returnTo))
const reasonMessage = $derived(
  reason === 'contribution'
    ? m.guest__reason_contribution()
    : reason === 'profile'
      ? m.guest__reason_profile()
      : reason === 'admin'
        ? m.guest__reason_admin()
        : reason === 'subscription'
          ? m.guest__reason_subscription()
          : m.guest__reason_sync(),
)

async function handleEmailSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy) return

  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result =
      mode === 'sign-up'
        ? await signUp.email({
            email,
            password,
            name: email.split('@')[0] || 'HYPE user',
            callbackURL: safeCallbackUrl,
          })
        : await signIn.email({ email, password, callbackURL: safeCallbackUrl })

    if (result.error) {
      errorMessage = m.guest__auth_generic_error()
      return
    }

    if (mode === 'sign-up') {
      isAwaitingVerification = true
      statusMessage = m.guest__verification_sent()
      return
    }

    open = false
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

/** Resends the verification message using a generic response. */
async function handleVerificationResend(): Promise<void> {
  if (isBusy || !email.trim()) return

  isBusy = true
  errorMessage = ''
  try {
    await authClient.sendVerificationEmail({
      email: email.trim(),
      callbackURL: safeCallbackUrl,
    })
  } finally {
    // Keep the response generic so account state is not disclosed.
    statusMessage = m.guest__verification_resent()
    isBusy = false
  }
}

async function handleGoogle(): Promise<void> {
  errorMessage = ''
  try {
    await signIn.social({ provider: 'google', callbackURL: safeCallbackUrl })
  } catch {
    errorMessage = m.guest__auth_generic_error()
  }
}

async function handlePasswordResetRequest(): Promise<void> {
  errorMessage = ''
  statusMessage = ''
  if (!email.trim()) {
    errorMessage = m.guest__email_required()
    return
  }

  try {
    await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/account/reset-password`,
    })
  } finally {
    // A generic response avoids revealing whether an account exists.
    statusMessage = m.guest__password_reset_requested()
  }
}

/** Switches email auth mode and clears status that belongs to the prior flow. */
function handleModeToggle(): void {
  mode = mode === 'sign-up' ? 'sign-in' : 'sign-up'
  errorMessage = ''
  statusMessage = ''
  isAwaitingVerification = false
}
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm" />
    <Dialog.Content
      class="bits-theme fixed left-1/2 top-1/2 z-[1001] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-neutral-950 p-6 text-white shadow-2xl"
    >
      <Dialog.Title class="text-xl font-semibold"
        >{m.guest__upgrade_title()}</Dialog.Title
      >
      <Dialog.Description class="mt-2 text-sm leading-6 text-white/70">
        {reasonMessage}
      </Dialog.Description>

      <div class="mt-5 flex flex-col gap-3">
        <button
          class="flex items-center justify-center gap-3 rounded-lg border border-white/20 bg-white px-4 py-2 font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
          type="button"
          disabled={isBusy}
          onclick={handleGoogle}
        >
          <Google class="h-5 w-5" />
          {m.preauth__continue_with_google()}
        </button>

        {#each AUTH_PROVIDER_REGISTRY.filter(provider => provider.id === 'apple' || provider.id === 'wechat') as provider (provider.id)}
          <button
            class="flex items-center justify-center gap-3 rounded-lg border border-white/10 px-4 py-2 text-white/40"
            type="button"
            disabled={!provider.enabled}
          >
            {#if provider.id === 'apple'}
              <Apple class="h-5 w-5 text-[#a7a9ac]" />
            {:else}
              <Wechat class="h-5 w-5 text-[#07c160]" />
            {/if}
            <span>{provider.label} · {m.guest__coming_soon()}</span>
          </button>
        {/each}

        <button
          class="flex items-center justify-center gap-3 rounded-lg border border-white/20 px-4 py-2 text-white transition hover:border-white/40 hover:bg-white/5"
          type="button"
          aria-expanded={showEmailAuth}
          onclick={() => {
            showEmailAuth = !showEmailAuth
            errorMessage = ''
            statusMessage = ''
          }}
        >
          <Mail class="h-5 w-5 text-white/70" />
          {m.guest__email()}
        </button>
      </div>

      {#if !showEmailAuth && errorMessage}
        <p class="mt-3 text-sm text-red-300">{errorMessage}</p>
      {/if}

      {#if showEmailAuth}
        <form class="mt-4 flex flex-col gap-3" onsubmit={handleEmailSubmit}>
          <label class="flex flex-col gap-1 text-sm">
            {m.guest__email()}
            <input
              class="rounded-lg border border-white/20 bg-white/8 px-3 py-2"
              type="email"
              autocomplete="email"
              bind:value={email}
              required
            >
          </label>
          <label class="flex flex-col gap-1 text-sm">
            {m.guest__password()}
            <input
              class="rounded-lg border border-white/20 bg-white/8 px-3 py-2"
              type="password"
              autocomplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              minlength="8"
              maxlength="128"
              bind:value={password}
              required
            >
          </label>
          {#if errorMessage}
            <p class="text-sm text-red-300">{errorMessage}</p>
          {/if}
          {#if statusMessage}
            <p class="text-sm text-emerald-300">{statusMessage}</p>
          {/if}
          <button
            class="rounded-lg bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
            type="submit"
            disabled={isBusy}
          >
            {mode === 'sign-up' ? m.guest__create_account() : m.guest__sign_in()}
          </button>
        </form>
      {/if}

      {#if isAwaitingVerification}
        <button
          class="mt-3 text-sm text-white/65 underline disabled:opacity-50"
          type="button"
          disabled={isBusy}
          onclick={handleVerificationResend}
        >
          {m.guest__resend_verification()}
        </button>
      {/if}

      {#if showEmailAuth}
        {#if mode === 'sign-in'}
          <button
            class="mt-3 text-sm text-white/65 underline"
            type="button"
            onclick={handlePasswordResetRequest}
          >
            {m.guest__forgot_password()}
          </button>
        {/if}
        <button
          class="mt-4 text-sm text-white/65 underline"
          type="button"
          onclick={handleModeToggle}
        >
          {mode === 'sign-up'
            ? m.guest__use_existing_account()
            : m.guest__create_new_account()}
        </button>
      {/if}
      <Dialog.Close
        class="absolute right-4 top-4 text-white/60"
        aria-label={m.guest__close()}
      >
        ×
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
