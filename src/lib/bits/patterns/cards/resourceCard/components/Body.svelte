<script lang="ts">
import { Card } from '#lib/bits/custom/index.js'
import type { ResourceCardBodyProps } from '../resourceCard.types'

let {
  code = null,
  name = null,
  class: className = '',
}: ResourceCardBodyProps = $props()

const resolvedCode = $derived(name ? code || '-' : '-')
const resolvedName = $derived(name || code || '-')
</script>

<Card.Body code={resolvedCode} title={resolvedName} class={className} />
