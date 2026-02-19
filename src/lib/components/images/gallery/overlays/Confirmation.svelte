<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
// TYPES
import type { Image } from '$lib/types'

const imageCtx = getImageCtx()

type Props = {
  image: Image
}

let { image }: Props = $props()
</script>

<div
  class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-lg bg-glass-result/70 p-4 text-center backdrop-blur-sm"
  transition:fade={{ duration: 200 }}
>
  <p class="text-sm">{m.equal_petty_goose_pull()}</p>
  <div class="flex gap-2">
    <button
      class="btn btn-sm border-none bg-glass-rejected hover:border-none hover:bg-glass-rejected/80"
      onclick={(e) => {
        imageCtx.handleConfirmDelete(e, image);
      }}
    >
      {m.whole_deft_penguin_enchant()}
    </button>
    <button
      class="btn btn-ghost btn-sm border-none hover:border-none"
      onclick={(e) => {
        imageCtx.handleCancelDelete(e, image);
      }}
    >
      {m.cancel()}
    </button>
  </div>
</div>
