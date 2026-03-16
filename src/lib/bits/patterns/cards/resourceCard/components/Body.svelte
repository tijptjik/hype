<script lang="ts">
import ScrollableText from '$lib/bits/custom/text/ScrollableText.svelte'
import type { ResourceCardBodyProps } from '../resourceCard.types'

let {
  code = null,
  name = null,
  class: className = '',
}: ResourceCardBodyProps = $props()

const resolvedCode = $derived(name ? code || '-' : '-')
const resolvedName = $derived(name || code || '-')
</script>

<div class={`bits-form__parent-resource-item-copy ${className}`}>
  <div class="bits-form__parent-resource-item-code">
    <ScrollableText text={resolvedCode} />
  </div>
  <div class="bits-form__parent-resource-item-name">
    <ScrollableText text={resolvedName} />
  </div>
</div>
