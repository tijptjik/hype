<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// PROJECT
import { authClient } from '$lib/auth/client'
// I18N
import { m } from '$lib/i18n'

let hasPassword = $state(true)
let isLoading = $state(true)
let isBusy = $state(false)
let newPassword = $state('')
let errorMessage = $state('')
let statusMessage = $state('')
let wasPasswordAdded = $state(false)

onMount(async () => {
  try {
    const result = await authClient.listAccounts()
    if (!result.error && result.data) {
      hasPassword = result.data.some(account => account.providerId === 'credential')
    }
  } catch {
    // Keep the security control hidden if account discovery is unavailable.
    hasPassword = true
  } finally {
    isLoading = false
  }
})

/** Adds a password without creating a second user or replacing an existing password. */
async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (isBusy || hasPassword) return

  isBusy = true
  errorMessage = ''
  statusMessage = ''
  try {
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    })
    if (!response.ok) {
      errorMessage = m.account__password_add_error()
      return
    }

    newPassword = ''
    hasPassword = true
    wasPasswordAdded = true
    statusMessage = m.account__password_added()
  } catch {
    errorMessage = m.account__password_add_error()
  } finally {
    isBusy = false
  }
}
</script>

{#if !isLoading && (!hasPassword || wasPasswordAdded)}
  <section class="mx-4 my-3 rounded-xl border border-base-content/15 p-4">
    {#if wasPasswordAdded}
      <h2 class="font-medium">{m.account__password_added()}</h2>
    {:else}
      <h2 class="font-medium">{m.account__add_password_title()}</h2>
      <p class="mt-1 text-sm text-base-content/70">
        {m.account__add_password_description()}
      </p>
    {/if}
    {#if !hasPassword}
      <form class="mt-3 flex flex-col gap-2" onsubmit={handleSubmit}>
        <input
          class="rounded-lg border border-base-content/20 bg-base-100 px-3 py-2"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="128"
          bind:value={newPassword}
          aria-label={m.guest__password()}
          required
        >
        {#if errorMessage}
          <p class="text-sm text-error">{errorMessage}</p>
        {/if}
        <button
          class="rounded-lg bg-base-content px-3 py-2 text-sm font-medium text-base-100 disabled:opacity-50"
          type="submit"
          disabled={isBusy}
        >
          {m.account__add_password_action()}
        </button>
      </form>
    {/if}
    {#if statusMessage}
      <p class="mt-3 text-sm text-success">{statusMessage}</p>
    {/if}
  </section>
{/if}
