<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { ResourceControlBarResultCountProps } from './resourceControlBarPrimitives.types'

let { count, class: className = '' }: ResourceControlBarResultCountProps = $props()
</script>

<div
  class={`bits-resource-filter-bar__result-count ${className}`.trim()}
  aria-label={`Results: ${count}`}
>
  <span class="bits-resource-filter-bar__result-count-value">{count}</span>
</div>
