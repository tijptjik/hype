<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { goto } from '$app/navigation'
import { untrack } from 'svelte'
// API
import { getBuildingLocationDetails } from '#lib/api/buildingLocationDetails.remote.js'
// DOMAIN
import { buildingSourceHref } from '#lib/locations/buildingSource.js'
import { ADDRESS_LOCALES } from '#lib/addresses/featureAddress.js'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// COMPONENTS
import AddressDetails from '#lib/bits/patterns/forms/formFeatureAddress/AddressDetails.svelte'
import AddressDivisions from '#lib/bits/patterns/forms/formFeatureAddress/AddressDivisions.svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
// ICONS
import BuildingIcon from 'virtual:icons/lucide/building-2'
// BITS COMPONENTS

const header = getHeaderCtrl()
const source = $derived({
  id: page.params.id ?? '',
  release: page.url.searchParams.get('release') ?? '',
  ...(page.url.searchParams.get('address')
    ? { addressId: page.url.searchParams.get('address')! }
    : {}),
})
const request = $derived(
  getBuildingLocationDetails({
    ...source,
    preferImported: page.url.searchParams.get('view') === 'location',
  }),
)
$effect(() => {
  const result = request.current
  if (result?.type === 'location') {
    void goto(`/admin/locations/${encodeURIComponent(result.locationId)}`, {
      replace: true,
    })
    return
  }
  const locale =
    getLocaleKey() === 'zhHant'
      ? 'zh-hant'
      : getLocaleKey() === 'zhHans'
        ? 'zh-hans'
        : 'en'
  const title =
    result?.type === 'preview'
      ? result.names[locale] ||
        result.names.en ||
        Object.values(result.names).find(Boolean)
      : undefined
  untrack(() => {
    header.setEditing(false)
    header.setHeaderForEntity(
      title || locationKindLabel('building'),
      BuildingIcon,
      new Map(),
    )
    header.setCrumbs([{ name: m.location_policy_tab(), href: '/admin/locations' }])
    header.setFormActions({
      canEdit: false,
      canPublish: false,
      showPublishAction: false,
      showDeleteAction: false,
    })
  })
})
// BITS COMPONENTS
import AddressEditorSkeleton from '#lib/bits/patterns/forms/localLocationAddress/AddressEditorSkeleton.svelte'
</script>

<section class="min-w-0 space-y-6 p-6">
  {#await request}
    <AddressEditorSkeleton />
  {:then result}
    {#if result.type === 'preview'}
      <div class="text-muted-foreground flex items-center gap-2 text-sm">
        <BuildingIcon class="size-5" />{m.location_building_catalogue_preview()}
      </div>
      {#if result.candidates.length > 1}
        <nav aria-label={m.building_choose_address()} class="space-y-2">
          <h2 class="font-semibold">{m.building_choose_address()}</h2>
          <ul class="space-y-1">
            {#each result.candidates as candidate (candidate.id)}
              <li>
                <a
                  href={buildingSourceHref({ ...source, addressId: candidate.id })}
                  aria-current={candidate.id === result.selectedId ? 'page' : undefined}
                  class="break-words underline aria-[current=page]:font-semibold"
                  >{candidate.display[ADDRESS_LOCALES[getLocaleKey()]] ||
                    candidate.display.en ||
                    Object.values(candidate.display)[0] ||
                    candidate.id}</a
                >
              </li>
            {/each}
          </ul>
        </nav>
      {/if}
      {#if result.selectedId || !result.candidates.length}
        <AddressDetails
          address={result.address}
          locationKind="building"
          onChange={() => {}}
        />
      {/if}
      {#if result.address.coordinates}
        <AddressDivisions
          address={result.address}
          coordinates={result.address.coordinates}
          onChange={() => {}}
        />
      {/if}
    {/if}
  {:catch}
    <p role="alert">{m.resource_action_failed()}</p>
  {/await}
</section>
