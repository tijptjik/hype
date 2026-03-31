<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import ExclamationTriangle from 'virtual:icons/lucide/triangle-alert'

// CONTEXT
const cardCtx = getCardCtx()
const imageCtx = getImageCtx()

$effect(() => {
  if (
    imageCtx.getStagedImages().length > 0 &&
    cardCtx.validationError === m.validation__at_least_one_image()
  ) {
    cardCtx.resetError()
  }
})
</script>

{#if cardCtx.validationError}
  <div
    transition:slide={{ duration: 300 }}
    class="flex justify-center gap-2 bg-black px-3 pt-2 text-[1rem] font-medium text-warning w-100:px-4"
  >
    <Icon type="solid" src={ExclamationTriangle} class="h-6 w-6" />
    <span class="flex items-center gap-1"> {cardCtx.validationError} </span>
  </div>
{/if}
