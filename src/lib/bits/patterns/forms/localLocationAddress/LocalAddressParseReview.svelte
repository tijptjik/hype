<script lang="ts">
// API
import { reviewLocalAddress } from '#lib/api/addressLocation.remote.js'
// ADDRESS
import { localAddressParseInput } from '#lib/addresses/locationDraft.js'
import type { AddressParseResult, AddressContent } from '@saanseoi/address'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// ADDRESS DISPLAY
import {
  type FeatureAddress,
  emptyFeatureAddress,
  getAddressDisplay,
  ADDRESS_LOCALES,
} from '#lib/addresses/featureAddress.js'
// I18N
import { m } from '#lib/i18n.js'
let {
  draft,
  locationKind,
  disabled = false,
  onAccept,
}: {
  draft: FeatureAddress
  locationKind?: string
  disabled?: boolean
  onAccept: (proposal: AddressParseResult) => void
} = $props()
let review = $state.raw<{
  draft: FeatureAddress
  kind?: string
  parsed: AddressParseResult
} | null>(null)
let loading = $state(false)
let failed = $state(false)
const proposal = $derived(
  review?.draft === draft && review.kind === locationKind ? review.parsed : null,
)

/** Parse a copy; the editable address changes only when the proposal is accepted.
 * @returns Nothing. Catalogue errors leave the draft available for a retry.
 */
async function propose(): Promise<void> {
  loading = true
  failed = false
  review = null
  try {
    review = {
      draft,
      kind: locationKind,
      parsed: await reviewLocalAddress(
        localAddressParseInput($state.snapshot(draft), locationKind),
      ),
    }
  } catch {
    failed = true
  } finally {
    loading = false
  }
}
/** Resolve the exact proposed display with the ordinary Feature formatter. */
function display(content: AddressContent, tag: string): string {
  const locale = Object.entries(ADDRESS_LOCALES).find(
    ([, value]) => value === tag,
  )?.[0] as keyof typeof ADDRESS_LOCALES | undefined
  if (!locale) return content.i18n[tag]?.formattedAddress ?? ''
  const address = emptyFeatureAddress()
  address.source.authored = content
  return getAddressDisplay(address, locale)
}
</script>
<div class="space-y-3">
  <Button
    text={m.location_address_parse()}
    disabled={disabled || loading}
    onClick={propose}
  />
  {#if loading}
    <div aria-busy="true" class="bg-muted h-24 animate-pulse rounded-xl"></div>
  {:else if failed}
    <p role="alert" class="text-destructive text-sm">{m.address_names_unavailable()}</p>
  {/if}
  {#if proposal}
    <section
      class="border-border space-y-3 rounded-xl border p-4"
      aria-label={m.location_address_parse()}
    >
      <p class="text-muted-foreground text-sm">{m.location_address_parse_help()}</p>
      {#each Object.keys(proposal.source) as tag}
        <div class="grid gap-2 sm:grid-cols-2">
          <p>
            <span class="text-muted-foreground text-xs"
              >{tag}
              · {m.location_review_before()}</span
            ><br>{proposal.source[tag]}
          </p>
          <p>
            <span class="text-muted-foreground text-xs"
              >{tag}
              · {m.location_review_candidate()}</span
            ><br>{display(proposal.content, tag)}
          </p>
        </div>
        {#if proposal.unresolved[tag]}
          <p class="text-muted-foreground text-sm">
            {m.location_address_unparsed()}: {proposal.unresolved[tag]}
          </p>
        {/if}
      {/each}
      {#each proposal.diagnostics as diagnostic}
        <p class="text-sm">{diagnostic}</p>
      {/each}
      <Button
        text={m.location_address_use_parse()}
        {disabled}
        onClick={() => {
          if (!proposal) return
          onAccept(proposal)
          review = null
        }}
      />
    </section>
  {/if}
</div>
