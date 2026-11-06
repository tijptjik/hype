<script lang="ts">
// VALIDATION
import { z } from 'zod'
// I18N
import { m } from '#lib/i18n.js'
// API
import { getLayerRelocationPolicy } from '#lib/api/layerLocationPolicy.remote.js'
// DOMAIN
import { RelocationPolicySchema } from '#lib/locations/model.js'
// COMPONENTS
import RelocationPolicySection from './RelocationPolicySection.svelte'

let {
  layerId,
  staged,
  isEditing,
  saving,
  onChange,
}: {
  layerId: string
  staged?: string
  isEditing: boolean
  saving: boolean
  onChange: (value: string | undefined) => void
} = $props()
const settings = $derived(getLayerRelocationPolicy({ layerId }))
const draftSchema = z.strictObject({
  policy: RelocationPolicySchema.nullable(),
  expectedRevision: z.number().int().nonnegative(),
})
const draft = $derived.by(() => {
  if (!staged) return null
  try {
    const result = draftSchema.safeParse(JSON.parse(staged))
    return result.success ? result.data : null
  } catch {
    return null
  }
})
</script>

{#await settings}
  <p class="text-muted-foreground p-6" role="status">{m.location_policy_loading()}</p>
{:then initial}
  <RelocationPolicySection
    value={draft ? draft.policy : initial.policy}
    inherited={initial.projectPolicy}
    allowInherit
    {isEditing}
    {saving}
    onValueChange={policy =>
      onChange(
        policy === initial.policy &&
          (!draft || draft.expectedRevision === initial.revision)
          ? undefined
          : JSON.stringify({
              policy,
              expectedRevision: draft?.expectedRevision ?? initial.revision,
            }),
      )}
  />
{:catch}
  <p class="text-muted-foreground p-6" role="alert">
    {m.location_policy_layer_unavailable()}
  </p>
{/await}
