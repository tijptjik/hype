<script lang="ts">
// COMPONENTS
import LocalAddressParseReview from './LocalAddressParseReview.svelte'
import AddressDetails from '../formFeatureAddress/AddressDetails.svelte'
// DOMAIN
import {
  applyLocalAddressParse,
  localAddressDraft,
  localAddressContent,
} from '#lib/addresses/locationDraft.js'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { AddressParseResult } from '@saanseoi/address'
import type { LocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

let {
  value = $bindable(),
  disabled = false,
  show3dAddressOptions = true,
  locationKind,
  onParsed,
}: {
  value: LocalLocationAddress
  disabled?: boolean
  show3dAddressOptions?: boolean
  locationKind?: string
  onParsed?: (proposal: AddressParseResult) => void
} = $props()
let draft = $state<FeatureAddress | null>(null)
let written: LocalLocationAddress | undefined
$effect(() => {
  if (written !== value) {
    written = value
    draft = localAddressDraft($state.snapshot(value))
  }
})
/** Update the selected combined component while preserving every other locale and null semantics.
 * @param next Shared editor draft, including original expressions and parsed semantics.
 * @returns Nothing; the owning form retains persistence authority.
 * @remarks Exact locale expressions are retained when semantics cannot reproduce the wording.
 */
function change(next: FeatureAddress): void {
  draft = next
  value = localAddressContent($state.snapshot(next))
  written = value
}
</script>

<fieldset {disabled} class="border-border space-y-5 rounded-xl border p-4">
  <legend class="px-2 font-medium">{m.feature__address()}</legend>
  {#if draft}
    <AddressDetails
      {locationKind}
      address={draft}
      isEditing={true}
      showAccessHints={false}
      {show3dAddressOptions}
      onChange={change}
    />
  {/if}
  <details class="border-border border-t pt-3">
    <summary class="text-muted-foreground cursor-pointer text-sm">
      {m.location_address_parse()}
    </summary>
    {#if draft}
      <div class="pt-3">
        <LocalAddressParseReview
          {draft}
          {locationKind}
          {disabled}
          onAccept={proposal => {
            if (!draft) return
            change(applyLocalAddressParse($state.snapshot(draft), proposal.content))
            onParsed?.(proposal)
          }}
        />
      </div>
    {/if}
  </details>
</fieldset>
