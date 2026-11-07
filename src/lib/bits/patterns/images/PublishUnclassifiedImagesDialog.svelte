<script lang="ts">
// REMOTE
import { getUnclassifiedPublicationPreview, publishUnclassifiedImages } from '#lib/api/imagePublication.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// BITS COMPONENTS
import ChoiceDialog from '#lib/bits/core/dialog/ChoiceDialog.svelte'
import Button from '#lib/bits/core/button/Button.svelte'

let { scopeType, scopeId, onDone }: { scopeType: 'feature' | 'layer' | 'project' | 'organisation'; scopeId: string; onDone: () => void } = $props()
let preview = $state<{ count: number; label: string; token: string } | null>(null)
let busy = $state(false)
let message = $state('')

$effect(() => {
  let active = true
  const scope = { type: scopeType, id: scopeId }
  void refreshRemoteQuery(getUnclassifiedPublicationPreview(scope)).then(result => {
    if (!active) return
    if (!result.count) onDone()
    else preview = result
  }).catch(cause => { if (active) message = cause instanceof Error ? cause.message : 'Could not load unclassified images.' })
  return () => { active = false }
})

/** Publishes the inspected images without overriding private intent choices. */
async function publish(): Promise<void> {
  if (!preview || busy) return
  busy = true
  try {
    await publishUnclassifiedImages({ scope: { type: scopeType, id: scopeId }, token: preview.token })
    window.dispatchEvent(new CustomEvent('refreshImages'))
    onDone()
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Could not publish these images.'
    preview = await refreshRemoteQuery(getUnclassifiedPublicationPreview({ type: scopeType, id: scopeId }))
  } finally { busy = false }
}
</script>

{#if preview || message}
  <ChoiceDialog title="Publish unclassified images?" description={preview ? `Also assign ${preview.count} unclassified images to ${preview.label} and publish them? Other intents keep their configured visibility.` : message} onCancel={() => { if (!busy) onDone() }}>
    <div class="flex flex-col gap-3">
      {#if message}<p role="alert" class="text-sm text-error">{message}</p>{/if}
      <div class="flex flex-wrap gap-3">
        <Button text={`Publish as ${preview?.label ?? 'General'}`} disabled={!preview || busy} onClick={() => void publish()} />
        <Button text="Keep images unclassified" style="outline" disabled={busy} onClick={onDone} />
      </div>
    </div>
  </ChoiceDialog>
{/if}
