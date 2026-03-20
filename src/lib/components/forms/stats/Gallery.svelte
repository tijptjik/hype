<script lang="ts">
import { fade } from 'svelte/transition'
import { getImageCtx } from '$lib/context/image.svelte'

const imageCtx = getImageCtx()

const imageCount = $derived(imageCtx.getImages().length)
</script>

<div class="flex min-w-0 flex-1 items-center justify-center">
  {#key imageCount}
    <p
      in:fade={{ duration: 200 }}
      class="truncate text-sm uppercase tracking-wide text-base-content/70"
    >
      {imageCount}
      image{imageCount === 1 ? '' : 's'}
    </p>
  {/key}
</div>
