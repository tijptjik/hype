<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// API
import { getAddressDivisionContext } from '#lib/api/division.remote.js'
// ADDRESS
import { ADDRESS_BLOCKS, addressBlocks } from '#lib/addresses/blocks.js'
import {
  authoredDivisionOverrides,
  effectiveAddressDivisions,
} from '#lib/addresses/divisions.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { AddressDivision } from '#lib/addresses/divisions.js'
import type { LocaleKey } from '#lib/types.js'

let {
  address,
  before,
  includeDivisions = true,
  locale = getLocaleKey(),
}: {
  address: FeatureAddress
  before?: FeatureAddress
  includeDivisions?: boolean
  locale?: LocaleKey
} = $props()
let expanded = $state(false)
let currentDivisions = $state<AddressDivision[]>([])
let oldDivisions = $state<AddressDivision[]>([])
let loading = $state(false)
let failed = $state(false)
const labels = $derived({
  unit: m.address_block_unit(),
  building: m.address_block_building(),
  premises: m.address_block_premises(),
  street: m.address_block_street(),
  administrative: m.address_divisions_administration(),
  locality: m.address_divisions_localities(),
  landform: m.address_block_islands(),
})
const current = $derived(addressBlocks(address, locale, currentDivisions))
const previous = $derived(before ? addressBlocks(before, locale, oldDivisions) : null)
const visible = $derived(
  ADDRESS_BLOCKS.filter(
    key =>
      (includeDivisions || !['administrative', 'locality', 'landform'].includes(key)) &&
      (expanded || (previous ? current[key] !== previous[key] : Boolean(current[key]))),
  ),
)
$effect(() => {
  // Detail views resolve geography through the shared icon layout instead.
  if (!includeDivisions) return
  const next = address,
    old = before
  let cancelled = false
  loading = true
  failed = false
  currentDivisions = []
  oldDivisions = []
  /** Resolve each point independently so a move can change geographic memberships. */
  const resolve = async (value: FeatureAddress): Promise<AddressDivision[]> => {
    if (!value.coordinates || value.coordinates.length !== 2) return []
    const context = await getAddressDivisionContext({
      coordinates: value.coordinates as [number, number],
    })
    if (!context.available) throw new Error('Division context unavailable')
    return effectiveAddressDivisions(context, {
      ...authoredDivisionOverrides(value.source.authored),
      ...value.source.divisionOverrides,
      ...value.divisionOverrides,
    })
  }
  Promise.all([resolve(next), old ? resolve(old) : Promise.resolve([])])
    .then(([nextRows, oldRows]) => {
      if (!cancelled) {
        currentDivisions = nextRows
        oldDivisions = oldRows
      }
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})
</script>
<div class="space-y-3" data-address-blocks>
  <div
    class="grid grid-cols-[minmax(8rem,1fr)_2fr] gap-x-4 gap-y-3 text-sm {before
      ? 'sm:grid-cols-[minmax(8rem,1fr)_2fr_2fr]'
      : ''}"
  >
    {#if before}
      <span></span
      ><span class="font-medium text-muted-foreground"
        >{m.location_review_before()}</span
      ><span class="font-medium text-warning">{m.location_review_candidate()}</span>
    {/if}
    {#each visible as key (key)}
      <div class="border-t border-border pt-3 font-medium text-muted-foreground">
        {labels[key]}
      </div>
      {#if previous}
        <div class="min-w-0 break-words border-t border-border pt-3">
          {previous[key] || '—'}
        </div>
      {/if}
      <div
        class="min-w-0 break-words border-t border-border pt-3 {previous &&
        current[key] !== previous[key]
          ? 'text-warning'
          : ''}"
      >
        {current[key] || '—'}
      </div>
    {/each}
  </div>
  {#if !visible.length && !loading}
    <p class="text-sm text-muted-foreground">
      {before ? m.address_blocks_unchanged() : m.address_blocks_empty()}
    </p>
  {/if}
  {#if loading}
    <p class="text-xs text-muted-foreground">{m.feature_location_loading()}</p>
  {/if}
  {#if failed}
    <p class="text-xs text-muted-foreground" role="status">
      {m.address_blocks_divisions_unavailable()}
    </p>
  {/if}
  <button
    type="button"
    class="text-sm text-primary hover:underline"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    {expanded ? m.address_blocks_collapse() : m.address_blocks_expand()}
  </button>
</div>
