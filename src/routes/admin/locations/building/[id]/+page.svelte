<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { goto } from '$app/navigation'
import { untrack } from 'svelte'
// API
import { getBuildingLocationDetails } from '#lib/api/buildingLocationDetails.remote.js'
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

const header = getHeaderCtrl()
const request = $derived(getBuildingLocationDetails({
  id: page.params.id ?? '', release: page.url.searchParams.get('release') ?? '',
  ...(page.url.searchParams.get('address') ? { addressId: page.url.searchParams.get('address')! } : {}),
}))
$effect(() => {
  const result = request.current
  if (result?.type === 'location') {
    void goto(`/admin/locations/${encodeURIComponent(result.locationId)}`, { replace: true })
    return
  }
  const locale = getLocaleKey() === 'zhHant' ? 'zh-hant' : getLocaleKey() === 'zhHans' ? 'zh-hans' : 'en'
  const title = result?.type === 'preview' ? result.names[locale] || result.names.en || Object.values(result.names).find(Boolean) : undefined
  untrack(() => {
    header.setEditing(false)
    header.setHeaderForEntity(title || locationKindLabel('building'), BuildingIcon, new Map())
    header.setCrumbs([{ name: m.location_policy_tab(), href: '/admin/locations' }])
    header.setFormActions({ canEdit: false, canPublish: false, showPublishAction: false, showDeleteAction: false })
  })
})
</script>

<section class="min-w-0 space-y-6 p-6">
  {#await request}
    <p role="status">{m.location_directory_loading()}</p>
  {:then result}
    {#if result.type === 'preview'}
      <div class="flex items-center gap-2 text-sm text-muted-foreground"><BuildingIcon class="size-5" />{m.location_building_catalogue_preview()}</div>
      <AddressDetails address={result.address} locationKind="building" onChange={() => {}} />
      {#if result.address.coordinates}<AddressDivisions address={result.address} coordinates={result.address.coordinates} onChange={() => {}} />{/if}
    {/if}
  {:catch}
    <p role="alert">{m.resource_action_failed()}</p>
  {/await}
</section>
