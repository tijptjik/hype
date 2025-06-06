<script lang="ts">
let { intent, imageId }: { intent: string; imageId: string } = $props();

// TODO Replace this with the intention widget from Gallery
const updateIntent = async (newIntent: string) => {
  try {
    const response = await fetch(`/api/images/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureImage: { intent: newIntent } })
    });

    if (!response.ok) {
      throw new Error('Failed to update intent');
    }

    intent = newIntent;
  } catch (error) {
    console.error('Error updating intent:', error);
  }
};
</script>

<div
  class="cursor-pointer rounded-full bg-base-300 px-3 py-1 text-sm font-medium"
  onclick={() => updateIntent(intent === 'context' ? 'general' : 'context')}>
  {intent}
</div>
