<script lang="ts">
// BITS
import LocationIcon from './LocationIcon.svelte'
// I18N
import { getLocale } from '#lib/i18n.js'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'
import type { LocationOperator } from '#lib/locations/operator.js'

let {
  kind,
  operator,
  class: className = 'size-7',
}: {
  kind: LocationKind
  operator?: LocationOperator | null
  class?: string
} = $props()
let failedLogo = $state<string | null>(null)
const logo = $derived(operator?.logo)
const name = $derived(operator?.names[getLocale()] || operator?.names.en || '')
</script>

{#if logo && failedLogo !== logo}
  <img
    src={logo}
    alt={name}
    class={`shrink-0 object-contain ${className}`}
    onerror={() => (failedLogo = logo ?? null)}
  >
{:else}
  <LocationIcon {kind} class={`text-muted-foreground shrink-0 ${className}`} />
{/if}
