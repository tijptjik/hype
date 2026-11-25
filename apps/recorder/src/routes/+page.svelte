<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { onDestroy, onMount } from 'svelte'
// TAURI
import { isTauri } from '@tauri-apps/api/core'
// I18N
import { t, errorMessage } from '#lib/i18n/index.js'
// API
import { connect, disconnect, connectionHint } from '#lib/hype.js'
import { setAssetAccount } from '#lib/assetCache.js'
import { recorderAccount } from '#lib/api/recorderAccount.remote.js'
import SessionWorkspace from '#lib/SessionWorkspace.svelte'
// STYLES
import '../app.css'

let code = $state('')
let busy = $state(false)
let signedIn = $state(false)
let retryAccount = $state(false)
let account = $state<Awaited<ReturnType<typeof recorderAccount>>>(null)
let message = $state('')
let pending = $state<AbortController>()
onDestroy(() => pending?.abort())
onMount(() => {
  if (isTauri()) void restoreSession()
})

/** Loads the device's saved session, including one just issued by browser approval.
 * @param justConnected Whether a successful exchange should have saved a session.
 * @returns After updating the account or presenting a retry.
 */
async function restoreSession(justConnected = false): Promise<void> {
  busy = true
  message = ''
  try {
    const identity = recorderAccount()
    await identity.refresh()
    account = await identity
    await setAssetAccount(account?.id ?? null)
    signedIn = Boolean(account)
    retryAccount = false
    if (justConnected && !account) message = t('could_not_verify_the_connected_account')
  } catch {
    retryAccount = true
    message = connectionHint
  } finally {
    busy = false
  }
}

async function signIn(): Promise<void> {
  if (!isTauri()) {
    message = t('open_hype_recorder_on_your_device_to_sign_in')
    return
  }
  const attempt = new AbortController()
  pending = attempt
  busy = true
  message = ''
  try {
    await connect(value => {
      code = value
    }, attempt.signal)
    pending = undefined
    code = ''
    await restoreSession(true)
  } catch (cause) {
    if (!attempt.signal.aborted)
      message = errorMessage(cause, 'could_not_connect_to_hype')
  } finally {
    pending = undefined
    busy = false
    code = ''
  }
}
async function signOut(): Promise<void> {
  await disconnect()
  await setAssetAccount(null)
  account = null
  signedIn = false
  message = ''
}
</script>

<svelte:head><title>{t('hype_recorder')}</title></svelte:head>
{#if signedIn}
  <main
    class={[
      'mx-auto flex max-w-lg flex-col gap-3 px-4',
      !page.state.recorder && 'pt-[max(0.6rem,env(safe-area-inset-top))]',
      ['map', 'recordMap'].includes(page.state.recorder?.view ?? '')
        ? 'h-dvh overflow-hidden'
        : 'min-h-svh',
      !page.state.recorder && 'pb-20',
    ]}
  >
    <SessionWorkspace {message} {account} onSignOut={signOut} />
  </main>
{:else}
  <main
    class="mx-auto flex min-h-svh max-w-lg flex-col justify-between gap-10 px-7 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
  >
    <header class="flex items-center gap-3 text-sm font-bold tracking-widest">
      <img src="/icon.png" width="32" height="32" alt=""> {t('hype')}
    </header>
    <section class="grid gap-5">
      <h1 class="text-6xl font-semibold tracking-tight">{t('recorder')}</h1>
      <p class="text-muted text-lg">
        {t('sign_in_with_your_hype_account_to_get_ready_for_field_recording')}
      </p>
      {#if pending}
        {#if code}
          <p>{t('match_this_code_in_your_browser_to_connect_your_account')}</p>
          <strong class="text-2xl tracking-widest">{code}</strong>
        {:else}
          <div
            class="bg-raised h-8 w-40 animate-pulse rounded"
            role="status"
            aria-label={t('requesting_a_sign_in_code')}
            aria-busy="true"
          ></div>
        {/if}
        <button
          type="button"
          class="rounded-xl border p-3"
          onclick={() => pending?.abort()}
        >
          {t('cancel_sign_in')}
        </button>
      {:else if busy}
        <div
          class="bg-raised h-12 animate-pulse rounded-xl"
          role="status"
          aria-label={t('connecting')}
          aria-busy="true"
        ></div>
      {:else}
        <button
          type="button"
          class="bg-accent text-on-accent rounded-xl p-3 font-semibold"
          onclick={() => (retryAccount ? restoreSession() : signIn())}
        >
          {retryAccount ? t('try_again') : t('sign_in_with_hype')}
        </button>
      {/if}
      {#if message}
        <p role="status">{message}</p>
      {/if}
    </section>
  </main>
{/if}
