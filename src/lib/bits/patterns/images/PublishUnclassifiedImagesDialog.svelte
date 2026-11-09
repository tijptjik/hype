<script lang="ts">
// REMOTE
import {
  getUnclassifiedPublicationPreview,
  publishUnclassifiedImages,
} from '#lib/api/imagePublication.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// BITS COMPONENTS
import ChoiceDialog from '#lib/bits/core/dialog/ChoiceDialog.svelte'
import Button from '#lib/bits/core/button/Button.svelte'

let {
  scopeType,
  scopeId,
  onDone,
}: {
  scopeType: 'feature' | 'layer' | 'project' | 'organisation'
  scopeId: string
  onDone: () => void
} = $props()
let preview = $state<{ count: number; label: string; token: string } | null>(null)
let busy = $state(false)
let message = $state('')
let requestOwner: { type: typeof scopeType; id: string; active: boolean } | null = null

/**
 * Checks that an asynchronous result still belongs to the mounted resource.
 * @param owner Scope captured when the preview was loaded.
 * @returns Whether this dialog may apply the result.
 */
function isCurrent(owner: NonNullable<typeof requestOwner>): boolean {
  return owner.active && owner.type === scopeType && owner.id === scopeId
}

$effect(() => {
  const scope = { type: scopeType, id: scopeId }
  const owner = { ...scope, active: true }
  requestOwner = owner
  preview = null
  message = ''
  busy = false
  void refreshRemoteQuery(getUnclassifiedPublicationPreview(scope))
    .then(result => {
      if (!isCurrent(owner)) return
      if (!result.count) onDone()
      else preview = result
    })
    .catch(cause => {
      if (isCurrent(owner))
        message =
          cause instanceof Error ? cause.message : 'Could not load unclassified images.'
    })
  return () => {
    owner.active = false
  }
})

/**
 * Publishes the inspected images without overriding private intent choices.
 * @returns Completion after publication or a handled preview recovery failure.
 * @remarks Obsolete requests cannot refresh or close a replacement dialog.
 */
async function publish(): Promise<void> {
  const owner = requestOwner
  if (!preview || busy || !owner || !isCurrent(owner)) return
  const scope = { type: owner.type, id: owner.id }
  busy = true
  try {
    await publishUnclassifiedImages({
      scope,
      token: preview.token,
    })
    if (!isCurrent(owner)) return
    window.dispatchEvent(new CustomEvent('refreshImages'))
    onDone()
  } catch (cause) {
    if (!isCurrent(owner)) return
    message = cause instanceof Error ? cause.message : 'Could not publish these images.'
    // A rejected token must be replaced before another publication attempt.
    preview = null
    try {
      const result = await refreshRemoteQuery(getUnclassifiedPublicationPreview(scope))
      if (!isCurrent(owner)) return
      if (!result.count) onDone()
      else preview = result
    } catch (refreshCause) {
      if (isCurrent(owner))
        message =
          refreshCause instanceof Error
            ? refreshCause.message
            : 'Could not reload unclassified images.'
    }
  } finally {
    if (isCurrent(owner)) busy = false
  }
}
</script>

{#if preview || message}
  <ChoiceDialog
    title="Publish unclassified images?"
    description={preview
      ? `Also assign ${preview.count} unclassified images to ${preview.label} and publish them? Other intents keep their configured visibility.`
      : message}
    onCancel={() => {
      if (!busy) onDone()
    }}
  >
    <div class="flex flex-col gap-3">
      {#if message}
        <p role="alert" class="text-error text-sm">{message}</p>
      {/if}
      <div class="flex flex-wrap gap-3">
        <Button
          text={`Publish as ${preview?.label ?? 'General'}`}
          disabled={!preview || busy}
          onClick={() => void publish()}
        />
        <Button
          text="Keep images unclassified"
          style="outline"
          disabled={busy}
          onClick={onDone}
        />
      </div>
    </div>
  </ChoiceDialog>
{/if}
