<script lang="ts">
// API
import {
  getOrganisationOnboarding,
  joinOrganisationFromCard,
} from '#lib/api/organisationUsers.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// AUTH
import { hasDurableAccount, requestAccountUpgrade } from '#lib/auth/upgrade.js'

let { organisationId }: { organisationId: string } = $props()
const account = getSurfaceCtx().account
let available = $state(false)
let joined = $state(false)
let busy = $state(false)
let message = $state('')
$effect(() => {
  const id = organisationId
  account.revision
  let current = true
  available = false
  joined = false
  busy = false
  message = ''
  // A membership response belongs to the current account, not just the displayed card.
  void refreshRemoteQuery(getOrganisationOnboarding({ organisationId: id }))
    .then(value => {
      if (current) {
        available = value.available
        joined = value.joined
      }
    })
    .catch(() => {})
  return () => {
    current = false
  }
})

/** Complete the card's explicit onboarding step for the current account.
 * @returns Completion after the server confirms membership.
 */
async function join(): Promise<void> {
  if (!hasDurableAccount(account.user)) {
    requestAccountUpgrade('account', window.location.href)
    return
  }
  const id = organisationId
  const revision = account.revision
  busy = true
  message = ''
  try {
    await joinOrganisationFromCard({ organisationId: id })
    if (organisationId === id && account.revision === revision) joined = true
  } catch {
    if (organisationId === id && account.revision === revision)
      message = 'Could not join. Please try again.'
  } finally {
    if (organisationId === id && account.revision === revision) busy = false
  }
}
</script>

{#if available}
  <div class="flex w-full min-w-0 flex-col items-center gap-2 p-2">
    <button
      type="button"
      class="border-primary text-primary rounded-md border px-4 py-2 text-sm disabled:opacity-60"
      disabled={busy || joined}
      onclick={join}
    >
      {joined ? 'Organisation user' : busy ? 'Joining…' : 'Join this organisation'}
    </button>
    {#if message}
      <p role="alert" class="text-center text-sm">{message}</p>
    {/if}
  </div>
{/if}
