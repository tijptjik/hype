<script lang="ts">
// SVELTE
import { page } from '$app/state'
// COMPONENTS
import LocalPlaceAddressEditor from '#lib/bits/patterns/forms/localPlaceAddress/LocalPlaceAddressEditor.svelte'
// DOMAIN
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
// API
import { getPlace } from '#lib/api/placeDirectory.remote.js'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import MapPin from 'virtual:icons/proicons/location'

const header = getHeaderCtrl()
const admin = getAdminCtx()
const request = $derived.by(() => {
  return getPlace({ id: page.params.id!, scope: admin.view.getRoleScopeQueryKey() })
})
$effect(() => {
  header.setHeaderForStandAlone(m.place_policy_tab(), MapPin, {
    showNew: false,
    showFilter: false,
    showViewActions: false,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  header.clearFooter()
})
</script>

<div class="min-h-0 flex-1 overflow-y-auto bg-panel">
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
    <a class="text-primary underline" href="/admin/places">{m.place_policy_tab()}</a>
    {#await request}
      <p>{m.place_directory_loading()}</p>
    {:then place}
      {#if place}
        <h1 class="text-2xl font-semibold">
          {place.facts?.names.en ??
            Object.values(place.facts?.names ?? {})[0] ??
            place.id}
        </h1>
        <dl
          class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-xl border border-border p-5"
        >
          <dt>HYPE ID</dt>
          <dd class="break-all">{place.id}</dd>
          <dt>SaanSeoi ID</dt>
          <dd class="break-all">{place.ssId ?? '—'}</dd>
          <dt>{m.place_directory_state()}</dt>
          <dd>{place.state} · {place.sourceAvailability}</dd>
          {#each Object.entries(place.facts?.names ?? {}) as [locale, name]}
            <dt>{locale}</dt>
            <dd>{name}</dd>
          {/each}
          <dt>{m.place_directory_phone()}</dt>
          <dd>{place.facts?.phoneNumber.join(', ') || '—'}</dd>
          <dt>{m.place_directory_brand()}</dt>
          <dd>
            {place.facts?.brands
              .map(brand => brand.names.en ?? Object.values(brand.names)[0])
              .join(', ') || '—'}
          </dd>
          <dt>{m.place_directory_location()}</dt>
          <dd>{place.facts?.location.geometry.coordinates.join(', ') ?? '—'}</dd>
          {#if place.facts}
            {#each ['en', 'zhHant', 'zhHans'] as const as locale}
              <dt>{m.feature__address()} ({locale})</dt>
              <dd>
                {getAddressDisplay(
                  {
                    version: 1,
                    source: place.facts.location.address,
                    coordinates: place.facts.location.geometry.coordinates,
                    matchStatus: place.facts.location.address.status,
                    overrides: {},
                  },
                  locale,
                ) || '—'}
              </dd>
            {/each}
          {/if}
        </dl>
        <LocalPlaceAddressEditor
          {place}
          onSaved={async () => {
            await request.refresh()
          }}
        />
        <p class="text-sm text-muted-foreground">{m.place_directory_detail_help()}</p>
      {:else}
        <p>{m.place_directory_empty()}</p>
      {/if}
    {:catch}
      <p role="alert">{m.resource_action_failed()}</p>
    {/await}
  </div>
</div>
