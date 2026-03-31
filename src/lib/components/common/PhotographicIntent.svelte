<script lang="ts">
import { intentDisplay } from '$lib/client/services/image'
import { setImageIntent } from '$lib/api/server/image.remote'
import { ImageContextResource } from '$lib/enums'
// TYPES
import type { Intent } from '$lib/db/zod/schema/image.types'

let {
  intent,
  imageId,
  featureId,
}: { intent: Intent; imageId: string; featureId: string } = $props()

// TODO Replace this with the intention widget from Gallery
const updateIntent = async (newIntent: Intent) => {
  try {
    await setImageIntent({
      id: imageId,
      ctxType: ImageContextResource.feature,
      ctxId: featureId,
      featureId,
      intent: newIntent,
      meta: { isAdminRequest: true },
    })
    intent = newIntent
  } catch (error) {
    console.error('Error updating intent:', error)
  }
}
</script>

<div
  class="cursor-pointer rounded-full bg-base-300 px-3 py-1 text-sm font-medium"
  onclick={() => updateIntent(intent === 'context' ? 'general' : 'context')}
>
  {intentDisplay[intent]}
</div>
