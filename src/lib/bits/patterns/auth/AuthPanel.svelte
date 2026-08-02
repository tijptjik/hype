<script lang="ts">
import { fade } from 'svelte/transition'

// ICONS
import Facebook from 'virtual:icons/simple-icons/facebook'
import Google from 'virtual:icons/logos/google-icon'
import Wechat from 'virtual:icons/simple-icons/wechat'
import Mail from 'virtual:icons/lucide/mail'
import KeyRound from 'virtual:icons/lucide/key-round'
// AUTH
import { authClient, signIn, signUp } from '$lib/auth/client'
import { toSafeReturnPath } from '$lib/auth/upgrade'
import { AUTH_PROVIDER_REGISTRY } from '$lib/auth/providers'
// I18N
import { m } from '$lib/i18n'

let {
  title = m.guest__upgrade_title(),
  description = '',
  returnTo = '/',
  showGuest = false,
  onGuest,
}: {
  title?: string
  description?: string
  returnTo?: string
  showGuest?: boolean
  onGuest?: () => void | Promise<void>
} = $props()

let email = $state('')
let password = $state('')
let mode = $state<'sign-in' | 'sign-up'>('sign-in')
let isBusy = $state(false)
let errorMessage = $state('')
let statusMessage = $state('')
let isAwaitingVerification = $state(false)
let showEmailAuth = $state(false)

const safeCallbackUrl = $derived(toSafeReturnPath(returnTo))

function providerIcon(providerId: string) {
  if (providerId === 'google') return Google
  if (providerId === 'facebook') return Facebook
  return Wechat
}

async function handleSocial(
  providerId: 'google' | 'facebook' | 'wechat',
): Promise<void> {
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  try {
    await signIn.social({ provider: providerId, callbackURL: safeCallbackUrl })
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

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
    }
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
    if (result.error) errorMessage = m.guest__auth_generic_error()
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    isBusy = false
  }
}

async function handleVerificationResend(): Promise<void> {
  if (isBusy || !email.trim()) return
  isBusy = true
  try {
    await authClient.sendVerificationEmail({
      email: email.trim(),
      callbackURL: safeCallbackUrl,
    })
  } catch {
    errorMessage = m.guest__auth_generic_error()
  } finally {
    statusMessage = m.guest__verification_resent()
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

function toggleMode(): void {
  mode = mode === 'sign-up' ? 'sign-in' : 'sign-up'
  errorMessage = ''
  statusMessage = ''
  isAwaitingVerification = false
}
</script>

<section
  class="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-950/95 p-6 text-white shadow-2xl"
>
  <h1 class="text-center text-2xl font-semibold">{title}</h1>
  {#if description}
    <p class="mt-2 text-center text-sm leading-6 text-white/70">{description}</p>
  {/if}

  {#if !showEmailAuth}
    <div class="mt-6 grid grid-cols-2 gap-3">
      {#each AUTH_PROVIDER_REGISTRY.filter(provider => provider.id !== 'email') as provider (provider.id)}
        {@const Icon = providerIcon(provider.id)}
        <button
          class="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white hover:bg-white/90 hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/20 disabled:hover:bg-transparent disabled:hover:text-inherit"
          class:bg-white={provider.enabled}
          class:text-black={provider.enabled}
          type="button"
          disabled={!provider.enabled || isBusy}
          onclick={() => handleSocial(provider.id)}
        >
          <Icon
            class={provider.id === 'facebook' ? 'h-5 w-5 text-[#1877F2]' : 'h-5 w-5'}
          />
          <span>{provider.enabled ? provider.label : m.login__coming_soon()}</span>
        </button>
      {/each}

      <button
        class="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white/40 hover:bg-white/5 hover:text-white"
        type="button"
        aria-expanded={showEmailAuth}
        onclick={() => (showEmailAuth = true)}
      >
        <Mail class="h-5 w-5 text-white/70" />
        {m.guest__email()}
      </button>
      <button
        class="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white hover:bg-white/5 disabled:opacity-40"
        type="button"
        disabled={isBusy}
        onclick={handlePasskey}
      >
        <KeyRound class="h-5 w-5 text-white/70" />
        {m.guest__sign_in_with_passkey()}
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
    <div class="mt-6" in:fade={{ duration: 180 }}>
      <form class="flex flex-col gap-3" onsubmit={handleEmailSubmit}>
        <label class="flex flex-col gap-1 text-sm"
          >{m.guest__email()}
          <input
            class="rounded-lg border border-white/20 bg-white/8 px-3 py-2 text-white"
            type="email"
            autocomplete="email"
            bind:value={email}
            required
          ></label
        >
        <label class="flex flex-col gap-1 text-sm"
          >{m.guest__password()}
          <input
            class="rounded-lg border border-white/20 bg-white/8 px-3 py-2 text-white"
            type="password"
            autocomplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            minlength="8"
            maxlength="128"
            bind:value={password}
            required
          ></label
        >
        {#if statusMessage}
          <p class="text-sm text-emerald-300">{statusMessage}</p>
        {/if}
        <button
          class="mt-3 w-1/3 self-center rounded-lg bg-[#4987E2] px-4 py-2 font-medium text-white transition hover:bg-[#4987E2]/90 disabled:opacity-50"
          type="submit"
          disabled={isBusy}
        >
          {mode === 'sign-up' ? m.guest__create_account() : m.guest__sign_in()}
        </button>
      </form>
      {#if isAwaitingVerification}
        <button
          class="mt-3 text-sm text-white/65 underline"
          type="button"
          disabled={isBusy}
          onclick={handleVerificationResend}
        >
          {m.guest__resend_verification()}
        </button>
      {/if}
      {#if errorMessage}
        <p class="mt-3 text-sm text-red-300">{errorMessage}</p>
      {/if}
      <footer class="mt-6 border-t border-white/10 pt-5 text-center">
        <div class="flex justify-center gap-2 text-sm text-white/65">
          {#if mode === 'sign-in'}
            <button
              type="button"
              class="underline"
              onclick={handlePasswordResetRequest}
            >
              {m.guest__forgot_password()}
            </button>
            <span aria-hidden="true">-</span>
          {/if}
          <button type="button" class="underline" onclick={toggleMode}>
            {mode === 'sign-up' ? m.guest__use_existing_account() : m.login__create_account()}
          </button>
        </div>
        <p class="mt-5 text-xs uppercase tracking-[0.16em] text-white/45">
          {m.login__or_login_with()}
        </p>
        <div class="mt-3 flex justify-center gap-3">
          {#each AUTH_PROVIDER_REGISTRY.filter(provider => provider.id !== 'email') as provider (provider.id)}
            {@const Icon = providerIcon(provider.id)}
            <button
              class="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 transition hover:border-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              aria-label={provider.label}
              title={provider.enabled ? provider.label : `${provider.label} · ${m.guest__coming_soon()}`}
              disabled={!provider.enabled || isBusy}
              onclick={() => handleSocial(provider.id)}
            >
              <Icon
                class={provider.id === 'facebook' ? 'h-5 w-5 text-[#1877F2]' : 'h-5 w-5'}
              />
            </button>
          {/each}
        </div>
        <button
          class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm transition hover:border-white/40 disabled:opacity-40"
          type="button"
          disabled={isBusy}
          onclick={handlePasskey}
        >
          <KeyRound class="h-4 w-4" />{m.guest__sign_in_with_passkey()}
        </button>
      </footer>
    </div>
  {/if}
</section>
