<script lang="ts">
import { Card } from '$lib/bits/custom'
import type { MapStyleCardBodyProps } from '../mapStyleCard.types'

let {
  code = null,
  name = null,
  description = null,
  class: className = '',
}: MapStyleCardBodyProps = $props()

const resolvedCode = $derived(name ? code || '-' : '-')
const resolvedName = $derived(name || code || '-')
</script>

<Card.Body
  code={resolvedCode}
  title={resolvedName}
  {description}
  maxDescriptionLines={2}
  class={`bits-map-style-card__body ${className}`}
/>
