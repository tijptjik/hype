<script lang="ts">
// BITS
import { cx } from '#lib/bits/utils.js'
// TYPES
import type { Snippet } from 'svelte'

let {
  title,
  description,
  actions,
  class: className = '',
  titleClass = '',
  descriptionClass = '',
}: {
  title: string
  description: string
  actions?: Snippet
  class?: string
  titleClass?: string
  descriptionClass?: string
} = $props()
</script>

<section
  class={cx(
    'flex min-h-64 w-full flex-1 flex-col items-center justify-center gap-3 px-6 py-6 text-center',
    className,
  )}
>
  <div class="flex w-full max-w-2xl flex-col items-center gap-3">
    <h3 class={cx('text-lg font-sans font-semibold', titleClass)}>{title}</h3>
    <p class={cx('max-w-2xl', descriptionClass)}>{description}</p>
  </div>
  {#if actions}
    <div class="mt-1 flex items-center justify-center gap-3">
      {@render actions()}
    </div>
  {/if}
</section>
