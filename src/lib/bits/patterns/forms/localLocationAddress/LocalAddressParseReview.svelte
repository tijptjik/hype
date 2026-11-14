<script lang="ts">
// SHARED ADDRESS PACKAGE
import { parseAddressContent } from '#lib/addresses/parseAddress.js'
import type { AddressParseResult, AddressContent } from '@saanseoi/address'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// ADDRESS DISPLAY
import {
  emptyFeatureAddress,
  getAddressDisplay,
  ADDRESS_LOCALES,
} from '#lib/addresses/featureAddress.js'
// I18N
import { m } from '#lib/i18n.js'
let {
  value = $bindable(),
  disabled = false,
  onParsed,
  onValueChange,
}: {
  value: AddressContent
  disabled?: boolean
  onParsed?: (source: Record<string, string>) => void
  onValueChange?: (content: AddressContent) => void
} = $props()
let proposal = $state<AddressParseResult | null>(null)
/** Parse a copy; the editable address changes only when the proposal is accepted. */
function propose(): void {
  proposal = parseAddressContent(
    Object.fromEntries(
      Object.keys(value.i18n).map(locale => [locale, display(value, locale)]),
    ),
  )
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
  <Button text={m.location_address_parse()} {disabled} onClick={propose} />
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
            ><br>{display(value, tag)}
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
          onParsed?.(proposal.source)
          value = proposal.content
          onValueChange?.(value)
          proposal = null
        }}
      />
    </section>
  {/if}
</div>
