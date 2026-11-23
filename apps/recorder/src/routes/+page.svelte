<script lang="ts">
// SVELTE
import { onDestroy, onMount } from 'svelte'
// TAURI
import { isTauri } from '@tauri-apps/api/core'
// API
import { connect, connectionHint, disconnect } from '#lib/hype.js'
import { recorderAccount } from '#lib/api/recorderAccount.remote.js'
// STYLES
import '../app.css'

let code = $state('')
let busy = $state(false)
let signedIn = $state(false)
let name = $state('')
let message = $state('')
let pending = $state<AbortController>()
onDestroy(() => pending?.abort())
onMount(() => {
  if (isTauri()) void restoreSession()
})

async function restoreSession(): Promise<void> {
  busy = true
  try {
    const identity = recorderAccount()
    await identity.refresh()
    const account = await identity
    signedIn = Boolean(account)
    name = account?.name ?? account?.id ?? ''
  } catch {
    message = connectionHint
  } finally {
    busy = false
  }
}

async function signIn(): Promise<void> {
  if (!isTauri()) {
    message = 'Open Hype Recorder on your device to sign in.'
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
    const identity = recorderAccount()
    await identity.refresh()
    const account = await identity
    if (!account)
      throw new Error('Could not verify the connected account. Sign out and try again.')
    signedIn = true
    name = account.name ?? account.id
  } catch (cause) {
    if (!attempt.signal.aborted)
      message = cause instanceof Error ? cause.message : 'Could not connect to HYPE.'
  } finally {
    pending = undefined
    busy = false
    code = ''
  }
}

async function signOut(): Promise<void> {
  busy = true
  message = ''
  try {
    await disconnect()
    name = ''
    signedIn = false
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Could not sign out.'
  } finally {
    busy = false
  }
}
</script>

<svelte:head><title>Hype Recorder</title></svelte:head>
<main
  class="mx-auto flex min-h-svh max-w-lg flex-col justify-between gap-10 px-7 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
>
  <header class="flex items-center gap-3 text-sm font-bold tracking-widest">
    <img src="/icon.png" width="32" height="32" alt=""> HYPE
  </header>
  <section class="grid gap-5">
    <h1 class="text-6xl font-semibold tracking-tight">Recorder</h1>
    <p class="text-lg text-slate-300">
      {signedIn
        ? name
          ? 'Signed in as ' + name
          : 'HYPE account'
        : 'Sign in with your HYPE account to get ready for field recording.'}
    </p>
    {#if pending}
      {#if code}
        <p>Match this code in your browser to connect your account.</p>
        <strong class="text-2xl tracking-widest">{code}</strong>
      {:else}
        <div
          class="h-8 w-40 animate-pulse rounded bg-slate-700"
          role="status"
          aria-label="Requesting a sign-in code"
          aria-busy="true"
        ></div>
      {/if}
      <button
        type="button"
        class="rounded-xl border p-3"
        onclick={() => pending?.abort()}
      >
        Cancel sign-in
      </button>
    {:else if busy}
      <div
        class="h-12 animate-pulse rounded-xl bg-slate-700"
        role="status"
        aria-label="Connecting"
        aria-busy="true"
      ></div>
    {:else}
      <button
        type="button"
        class="rounded-xl bg-white p-3 font-semibold text-black"
        onclick={signedIn ? signOut : signIn}
      >
        {signedIn ? 'Sign out' : 'Sign in with HYPE'}
      </button>
    {/if}
    {#if message}
      <p role="status">{message}</p>
    {/if}
  </section>
</main>
