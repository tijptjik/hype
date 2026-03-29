<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'

type HiddenInputAttrs = Record<string, string | number | boolean | null | undefined>

let {
  inputs = [],
  class: className = '',
}: {
  inputs?: HiddenInputAttrs[]
  class?: string
} = $props()

const rootClass = $derived(cx('hidden', className))
</script>

<div class={rootClass} aria-hidden="true">
  {#each inputs as inputAttrs, index (inputAttrs.name ?? index)}
    <input type="hidden" {...inputAttrs}>
  {/each}
</div>
