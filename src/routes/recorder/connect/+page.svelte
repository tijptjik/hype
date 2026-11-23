<script lang="ts">
// TYPES
import type { PageProps } from './$types'

let { data }: PageProps = $props()
let busy = $state(false)
let message = $state('')
let finished = $state(false)

async function decide(approve: boolean): Promise<void> {
  busy = true
  try {
    const review = await fetch(
      '/api/auth/device?user_code=' + encodeURIComponent(data.code),
    )
    const grant = await review.json()
    if (
      !review.ok ||
      grant.status !== 'pending' ||
      grant.client_id !== 'hk.hype.recorder'
    ) {
      throw new Error('This code is unavailable. Start sign-in again in Recorder.')
    }
    const result = await fetch('/api/auth/device/' + (approve ? 'approve' : 'deny'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userCode: data.code }),
    })
    if (!result.ok) throw new Error('The request could not be completed. Try again.')
    finished = true
    message = approve
      ? 'Connected. You can return to Hype Recorder.'
      : 'Connection declined.'
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Please try again.'
  } finally {
    busy = false
  }
}
</script>

<svelte:head><title>Connect Hype Recorder</title></svelte:head>
<main class="mx-auto grid max-w-md gap-5 p-6">
  <h1 class="text-3xl font-bold">Connect Hype Recorder</h1>
  {#if !finished}
    <p>
      Connect as {data.name}. Approve only if this code matches the one on your device.
    </p>
    <strong class="text-2xl tracking-widest">{data.code}</strong>
    <button
      type="button"
      class="rounded-lg bg-white p-3 text-black"
      disabled={busy}
      onclick={() => decide(true)}
    >
      Connect device
    </button>
    <button type="button" disabled={busy} onclick={() => decide(false)}>Decline</button>
  {/if}
  <p role="status">{message}</p>
</main>
