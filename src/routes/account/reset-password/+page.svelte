<script lang="ts">
// NAVIGATION
import { goto } from '$app/navigation'
import { page } from '$app/state'
// AUTH
import { authClient } from '$lib/auth/client'
// I18N
import { m } from '$lib/i18n'

let password = $state('')
let isBusy = $state(false)
let message = $state('')

/** Completes a Better Auth password reset without persisting its token. */
async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  const token = page.url.searchParams.get('token')
  if (!token) {
    message = m.account__password_reset_invalid()
    return
  }
  if (isBusy) return

  isBusy = true
  try {
    const result = await authClient.resetPassword({ newPassword: password, token })
    if (result.error) {
      message = m.account__password_reset_invalid()
      return
    }

    message = m.account__password_reset_success()
    window.setTimeout(() => void goto('/?upgrade=account'), 800)
  } catch {
    message = m.account__password_reset_invalid()
    isBusy = false
  }
}
</script>

<svelte:head><title>{m.account__password_reset_title()} · HYPE</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-black p-6 text-white">
  <form
    class="w-full max-w-sm rounded-2xl border border-white/15 p-6"
    onsubmit={handleSubmit}
  >
    <h1 class="text-xl font-semibold">{m.account__password_reset_title()}</h1>
    <label class="mt-5 flex flex-col gap-2 text-sm">
      {m.account__new_password()}
      <input
        class="rounded-lg border border-white/20 bg-white/8 px-3 py-2"
        type="password"
        autocomplete="new-password"
        minlength="8"
        maxlength="128"
        bind:value={password}
        required
      >
    </label>
    {#if message}
      <p class="mt-3 text-sm text-white/70">{message}</p>
    {/if}
    <button
      class="mt-4 w-full rounded-lg bg-white px-4 py-2 text-black"
      type="submit"
      disabled={isBusy}
    >
      {m.account__password_reset_action()}
    </button>
  </form>
</main>
