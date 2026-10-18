<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// BITS
import { Icon } from '#lib/bits/index.js'
// I18N
import { m } from '#lib/i18n.js'
// CONTEXT
import { getCardCtx } from '#lib/context/card.svelte.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
// ICONS
import ExclamationTriangle from 'virtual:icons/proicons/alert-triangle'

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
    class="flex w-full justify-center gap-2 bg-(--theme-panel) px-3 pt-2 text-[1rem] font-medium text-warning w-100:px-4"
  >
    <Icon src={ExclamationTriangle} class="h-6 w-6" filled />
    <span class="flex items-center gap-1">{cardCtx.validationError}</span>
  </div>
{/if}
