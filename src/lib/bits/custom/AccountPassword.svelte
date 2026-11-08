<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// PROJECT
import { authClient } from '#lib/auth/client.js'
import { getPasswordSetupError } from '#lib/auth/password-setup-feedback.js'
// I18N
import { m } from '#lib/i18n.js'

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
      errorMessage = await getPasswordSetupError(response)
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
  <section class="border-base-content/15 mx-4 my-3 rounded-xl border p-4">
    {#if wasPasswordAdded}
      <h2 class="font-medium">{m.account__password_added()}</h2>
    {:else}
      <h2 class="font-medium">{m.account__add_password_title()}</h2>
      <p class="text-base-content/70 mt-1 text-sm">
        {m.account__add_password_description()}
      </p>
    {/if}
    {#if !hasPassword}
      <form class="mt-3 flex flex-col gap-2" onsubmit={handleSubmit}>
        <input
          class="border-base-content/20 bg-base-100 rounded-lg border px-3 py-2"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="128"
          bind:value={newPassword}
          aria-label={m.guest__password()}
          required
        >
        {#if errorMessage}
          <p class="text-error text-sm">{errorMessage}</p>
        {/if}
        <button
          class="bg-base-content text-base-100 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          type="submit"
          disabled={isBusy}
        >
          {m.account__add_password_action()}
        </button>
      </form>
    {/if}
    {#if statusMessage}
      <p class="text-success mt-3 text-sm">{statusMessage}</p>
    {/if}
  </section>
{/if}
