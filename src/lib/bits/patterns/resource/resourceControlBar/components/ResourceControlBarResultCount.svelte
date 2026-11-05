<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// TYPES
import type { ResourceControlBarResultCountProps } from './resourceControlBarPrimitives.types'

let {
  count,
  countLoading = false,
  class: className = '',
}: ResourceControlBarResultCountProps = $props()
</script>

<output
  class={`bits-resource-filter-bar__result-count ${className}`.trim()}
  aria-busy={countLoading}
  aria-label={countLoading
    ? 'Loading result count'
    : count === null
      ? 'Results: unavailable'
      : `Results: ${count}`}
>
  {#if countLoading}
    <Skeleton class="h-3 w-8" />
  {:else}
    <span class="bits-resource-filter-bar__result-count-value">{count ?? '—'}</span>
  {/if}
</output>
