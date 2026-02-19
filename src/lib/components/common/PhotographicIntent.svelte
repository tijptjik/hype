<script lang="ts">
import { intentDisplay } from '$lib/client/services/image'
// TYPES
import type { Intent } from '$lib/types'

let { intent, imageId }: { intent: Intent; imageId: string } = $props()

// TODO Replace this with the intention widget from Gallery
const updateIntent = async (newIntent: string) => {
  try {
    const response = await fetch(`/api/images/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureImage: { intent: newIntent } }),
    })

    if (!response.ok) {
      throw new Error('Failed to update intent')
    }

    intent = newIntent as Intent
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
