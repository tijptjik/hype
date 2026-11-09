<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
// API
import {
  getLocationIdentityReviewAccess,
  retryLocationRematch,
} from '#lib/api/locationIdentity.remote.js'

let {
  locationId,
  jobId,
  status,
  reason,
  onCommitted,
}: {
  locationId: string
  jobId: string
  status: string
  reason?: string | null
  onCommitted: () => Promise<void>
} = $props()
let retrying = $state(false)
let retryError = $state(false)
const explanation = $derived(
  reason === 'MISSING_COORDINATES'
    ? m.location_rematch_no_coordinates()
    : reason === 'PROVIDER_UNAVAILABLE'
      ? m.location_rematch_no_provider()
      : reason === 'PROVIDER_OR_STORAGE_FAILED'
        ? m.location_rematch_failed()
        : m.location_rematch_deferred(),
)

/** Retry current retained intent through the owner-authorized command.
 * @returns Completion and refreshed task state; a stale or busy job stays explicit.
 */
async function retry(): Promise<void> {
  retrying = true
  retryError = false
  try {
    await retryLocationRematch({ locationId, jobId })
    await onCommitted()
  } catch {
    retryError = true
  } finally {
    retrying = false
  }
}
</script>

<div class="space-y-4 p-4">
  <p class="font-medium">{m.location_rematch_title()}</p>
  <p role="status">
    {status === 'pending' || status === 'checking'
      ? m.location_rematch_checking()
      : explanation}
  </p>
  <p class="text-muted-foreground text-sm">{m.location_rematch_preserve()}</p>
  {#if status === 'deferred' || status === 'failed'}
    {#await getLocationIdentityReviewAccess({ locationId }) then access}
      {#if access.allowed}
        <Button disabled={retrying} onClick={retry} text={m.location_rematch_retry()} />
      {/if}
    {/await}
  {/if}
  {#if retryError}
    <p role="alert">{m.location_rematch_retry_error()}</p>
  {/if}
</div>
