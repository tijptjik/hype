<script lang="ts">
// BITS
import LocationIcon from './LocationIcon.svelte'
// DOMAIN
import {
  facilityCategory,
  facilitySymbol,
  facilitySymbols,
} from '#lib/indoor/facilities.js'
// I18N
import { getLocale } from '#lib/i18n.js'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'
import type { LocationOperator } from '#lib/locations/operator.js'

let {
  kind,
  category,
  operator,
  class: className = 'size-7',
}: {
  kind: LocationKind
  category?: string | null
  operator?: LocationOperator | null
  class?: string
} = $props()
let failedLogo = $state<string | null>(null)
const logo = $derived(operator?.logo)
const name = $derived(operator?.names[getLocale()] || operator?.names.en || '')
const symbol = $derived(
  kind === 'building_part' && category && facilitySymbols[facilityCategory(category)]
    ? facilitySymbol(category)
    : null,
)
</script>

{#if symbol}
  <svg
    viewBox="0 0 24 24"
    class={`shrink-0 ${className}`}
    style:color={symbol.color}
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    data-location-facility={category}
  >
    <path d={symbol.path} />
  </svg>
{:else if logo && failedLogo !== logo}
  <img
    src={logo}
    alt={name}
    class={`shrink-0 object-contain ${className}`}
    onerror={() => (failedLogo = logo ?? null)}
  >
{:else}
  <LocationIcon {kind} class={`text-muted-foreground shrink-0 ${className}`} />
{/if}
