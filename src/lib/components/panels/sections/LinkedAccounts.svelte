<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// ICONS
import Facebook from 'virtual:icons/simple-icons/facebook'
import Google from 'virtual:icons/logos/google-icon'
import Wechat from 'virtual:icons/simple-icons/wechat'
import Mail from 'virtual:icons/lucide/mail'
import KeyRound from 'virtual:icons/lucide/key-round'
import Pencil from 'virtual:icons/lucide/pencil'
// AUTH
import { authClient, signIn, signUp, useSession } from '$lib/auth/client'
// I18N
import { m } from '$lib/i18n'

type Account = { providerId: string; accountId: string }
type Passkey = { id: string; name?: string; credentialID: string }
type SocialProvider = 'facebook' | 'google' | 'wechat'

const socialProviders: Array<{
  id: SocialProvider
  label: string
  icon: typeof Google
}> = [
  { id: 'google', label: 'Google', icon: Google },
  { id: 'facebook', label: 'Facebook', icon: Facebook },
  { id: 'wechat', label: 'WeChat', icon: Wechat },
]

let {
  accountUsername = '',
  isGuest = false,
}: {
  accountUsername?: string
  isGuest?: boolean
} = $props()

const session = useSession()

let accounts = $state<Account[]>([])
let isLoading = $state(true)
let isEditing = $state(false)
let isBusy = $state(false)
let newPassword = $state('')
let showEmailSetup = $state(false)
let errorMessage = $state('')
let statusMessage = $state('')
let passkeys = $state<Passkey[]>([])
let isAwaitingVerification = $state(false)
let accountEmail = $derived($session.data?.user?.email ?? '')
let email = $state('')
let resolvedEmail = $derived(accountEmail || accountUsername)

onMount(() => {
  email = resolvedEmail
  if (isGuest) {
    isLoading = false
  } else {
    void Promise.all([loadAccounts(), loadPasskeys()])
  }
})

/** Loads the providers currently linked to the signed-in user. */
async function loadAccounts(): Promise<void> {
  try {
    const result = await authClient.listAccounts()
    if (!result.error && result.data) accounts = result.data
  } finally {
    isLoading = false
  }
}

/** Loads passkeys currently registered for the signed-in user. */
async function loadPasskeys(): Promise<void> {
  try {
    const result = await authClient.passkey.listUserPasskeys()
    if (!result.error && result.data) passkeys = result.data
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
    if (result.error) throw new Error(result.error.message)
    await loadPasskeys()
    statusMessage = m.account__passkey_added()
  } catch {
    errorMessage = m.account__passkey_add_error()
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
  if (providerId === 'credential') return m.guest__email()
  if (providerId === 'google') return 'Google'
  if (providerId === 'facebook') return 'Facebook'
  if (providerId === 'wechat') return 'WeChat'
  return providerId
}

/** Returns the identity label shown for a linked social account. */
function accountDisplayLabel(providerId: string): string {
  if (providerId === 'credential') return m.guest__email()
  return accountEmail || accountUsername || providerLabel(providerId)
}

/** Starts the provider OAuth flow and links it to the current account. */
async function handleLink(providerId: SocialProvider): Promise<void> {
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  try {
    await authClient.linkSocial({
      provider: providerId,
      callbackURL: window.location.href,
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
    await signIn.social({ provider: providerId, callbackURL: window.location.href })
  } catch {
    errorMessage = m.guest__auth_generic_error()
    isBusy = false
  }
}

/** Creates an email account while preserving the current guest session's state. */
async function handleGuestEmailSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy) return
  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const result = await signUp.email({
      email,
      password: newPassword,
      name: email.split('@')[0] || 'HYPE user',
      callbackURL: window.location.href,
    })
    if (result.error) throw new Error(result.error.message)
    isAwaitingVerification = true
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
    accounts = [...accounts, { providerId: 'credential', accountId: 'credential' }]
    showEmailSetup = false
    statusMessage = m.account__password_added()
  } catch {
    errorMessage = m.account__password_add_error()
  } finally {
    isBusy = false
  }
}
</script>

{#if !isLoading}
  <section class="border-b border-base-content/15 p-4">
    {#if isGuest}
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
        <p class="mt-3 max-w-sm text-sm leading-5 text-base-content/75">
          {m.guest__reminder()}
        </p>
      </div>

      {#if isEditing}
        <div class="mt-4 flex flex-col gap-2 border-t border-base-content/10 pt-4">
          <h3 class="text-center text-sm font-medium text-base-content/70">
            {m.guest__upgrade_title()}
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
                <ProviderIcon class="h-4 w-4" />{provider.label}
              </button>
            {/each}
            {#if !showEmailSetup}
              <button
                class="flex items-center gap-2 rounded border border-base-content/20 px-2 py-1 text-sm disabled:opacity-50"
                type="button"
                disabled={isBusy}
                onclick={() => (showEmailSetup = true)}
              >
                <Mail class="h-4 w-4" />{m.guest__email()}
              </button>
            {/if}
          </div>

          {#if showEmailSetup}
            <form class="mt-2 flex flex-col gap-2" onsubmit={handleGuestEmailSubmit}>
              <label class="text-sm" for="guest-account-email"
                >{m.guest__email()}</label
              >
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
                autocomplete="new-password"
                minlength="8"
                maxlength="128"
                bind:value={newPassword}
                required
              >
              <button
                class="rounded-lg bg-base-content px-3 py-2 text-sm font-medium text-base-100 disabled:opacity-50"
                type="submit"
                disabled={isBusy}
              >
                {m.guest__create_account()}
              </button>
            </form>
          {/if}
          {#if isAwaitingVerification}
            <p class="text-sm text-success">{m.guest__verification_sent()}</p>
          {/if}
          {#if errorMessage}
            <p class="text-sm text-error">{errorMessage}</p>
          {/if}
          {#if statusMessage}
            <p class="text-sm text-success">{statusMessage}</p>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/65">
          {m.account__linked_accounts_title()}
        </h2>
        <button
          class="rounded p-1 text-base-content/65 transition hover:bg-base-content/10 hover:text-base-content"
          type="button"
          aria-label={m.forms__edit()}
          aria-expanded={isEditing}
          onclick={() => {
          isEditing = !isEditing
          errorMessage = ''
          statusMessage = ''
        }}
        >
          <Pencil class="h-4 w-4" />
        </button>
      </div>

      <div class="mt-2 flex min-h-8 items-center gap-3">
        {#each accounts as account (account.accountId)}
          {@const Icon = providerIcon(account.providerId)}
          <Icon
            class={account.providerId === 'facebook' ? 'h-6 w-6 text-[#1877F2]' : 'h-6 w-6'}
            aria-label={account.providerId}
          />
        {/each}
      </div>

      {#if isEditing}
        <div class="mt-3 flex flex-col gap-2 border-t border-base-content/10 pt-3">
          {#each accounts as account (account.accountId)}
            {@const Icon = providerIcon(account.providerId)}
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2"
                ><Icon
                  class={account.providerId === 'facebook' ? 'h-5 w-5 text-[#1877F2]' : 'h-5 w-5'}
                />{accountDisplayLabel(account.providerId)}</span
              >
              <button
                class="text-error disabled:opacity-40"
                type="button"
                disabled={isBusy || accounts.length <= 1}
                onclick={() => handleUnlink(account)}
              >
                {m.account__unlink()}
              </button>
            </div>
          {/each}
          {#each passkeys as registeredPasskey (registeredPasskey.id)}
            <KeyRound class="h-6 w-6" aria-label={m.account__passkey()} />
          {/each}

          <h3 class="mt-3 text-sm font-medium text-base-content/70">
            {m.account__link_another_account()}
          </h3>
          <div
            class="flex items-center justify-between gap-3 rounded border border-base-content/15 p-2 text-sm"
          >
            <span class="flex items-center gap-2"
              ><KeyRound class="h-4 w-4" />{m.account__passkey()}</span
            >
            <button
              class="rounded border border-base-content/20 px-2 py-1 disabled:opacity-50"
              type="button"
              disabled={isBusy}
              onclick={handleAddPasskey}
            >
              {passkeys.length ? m.account__add_passkey() : m.account__setup_passkey()}
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each socialProviders as provider (provider.id)}
              {@const ProviderIcon = provider.icon}
              {#if !accounts.some(account => account.providerId === provider.id)}
                <button
                  class="flex items-center gap-2 rounded border border-base-content/20 px-2 py-1 text-sm"
                  type="button"
                  disabled={isBusy}
                  onclick={() => handleLink(provider.id)}
                >
                  <ProviderIcon class="h-4 w-4" />{provider.label}
                </button>
              {/if}
            {/each}
            {#if !accounts.some(account => account.providerId === 'credential') && !showEmailSetup}
              <button
                class="flex items-center gap-2 rounded border border-base-content/20 px-2 py-1 text-sm"
                type="button"
                disabled={isBusy}
                onclick={() => (showEmailSetup = true)}
              >
                <Mail class="h-4 w-4" />{m.guest__email()}
              </button>
            {/if}
          </div>

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
                class="rounded-lg bg-base-content px-3 py-2 text-sm font-medium text-base-100 disabled:opacity-50"
                type="submit"
                disabled={isBusy}
              >
                {m.account__setup_email_login()}
              </button>
            </form>
          {/if}
          {#if errorMessage}
            <p class="text-sm text-error">{errorMessage}</p>
          {/if}
          {#if statusMessage}
            <p class="text-sm text-success">{statusMessage}</p>
          {/if}
        </div>
      {/if}
    {/if}
  </section>
{/if}
