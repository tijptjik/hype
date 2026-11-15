<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { untrack, type Snippet } from 'svelte'
// COMPONENTS
import Tabs from '#lib/bits/core/tabs/Tabs.svelte'
import * as Main from '#lib/bits/custom/main/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import LocalLocationAddressEditor from '#lib/bits/patterns/forms/localLocationAddress/LocalLocationAddressEditor.svelte'
import { Button } from '#lib/bits/core/index.js'
import { getAdminMapHref } from '#lib/navigation/adminMapLink.js'
// NAVIGATION
import { bindAdminFacetHistorySync } from '#lib/client/services/form.js'
import { getAdminFacetTabsForResource } from '#lib/navigation/index.js'
import { FirstClassResource } from '#lib/enums.js'
import ScopedFeatureIndex from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndex.svelte'
// API
import { getLocation } from '#lib/api/locationDirectory.remote.js'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import MapPin from 'virtual:icons/proicons/location'
// BITS COMPONENTS

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. Record and header navigation
// 2. Edit intent and header synchronization
// 3. Profile, Relationships and read-only Features
// ---

const header = getHeaderCtrl()
const admin = getAdminCtx()
const activeFacet = $derived(admin.activeFacet || 'core')
bindAdminFacetHistorySync({
  getFacetOrder: () => ['core', 'relationships', 'features'],
  getActiveFacet: () => admin.activeFacet,
  adminCtx: admin,
  resourceType: FirstClassResource.location,
  getResourceRef: () => page.params.id ?? '',
})
const facetTabs = getAdminFacetTabsForResource(FirstClassResource.location)
const scope = $derived(admin.view.getRoleScopeQueryKey())
const request = $derived(
  getLocation({
    id: page.params.id ?? '',
    organisationId: page.url.searchParams.get('organisation') ?? undefined,
    scope,
  }),
) // BITS COMPONENTS
import AddressEditorSkeleton from '#lib/bits/patterns/forms/localLocationAddress/AddressEditorSkeleton.svelte'

let editorContent = $state<Snippet | null>(null)
let pendingEdit = $state(false)
// Route changes discard the old record's edit mode before applying explicit edit intent.
$effect(() => {
  const id = page.params.id
  pendingEdit = untrack(() => page.url.searchParams.get('edit') === 'true')
  if (id) untrack(() => header.setEditing(false))
})
// Apply edit intent once after loading and authorization, so Cancel stays in view mode.
$effect(() => {
  const place = request.current
  if (!pendingEdit || !place || place.id !== page.params.id) return
  pendingEdit = false
  untrack(() => {
    header.setEditing(Boolean(place.canEditAddress && place.state !== 'redirect'))
  })
})
$effect(() => {
  const place = request.current
  const locale =
    getLocaleKey() === 'zhHant'
      ? 'zh-hant'
      : getLocaleKey() === 'zhHans'
        ? 'zh-hans'
        : 'en'
  // Match the community record displayed by the standalone editor, even with Organisation context.
  const facts = place?.sharedFacts ?? place?.facts
  const title =
    facts?.names[locale] ||
    facts?.names.en ||
    Object.values(facts?.names ?? {}).find(Boolean) ||
    m.location_policy_tab()
  untrack(() => {
    if (place && place.id === page.params.id)
      admin.view.cache.location.set(place.id, place)
    header.setHeaderForEntity(title, MapPin, facetTabs)
    header.setCrumbs([{ name: m.location_policy_tab(), href: '/admin/locations' }])
    header.setFormActions({
      canEdit: Boolean(place?.canEditAddress && place.state !== 'redirect'),
      content: locationEditorActions,
      canPublish: false,
      showPublishAction: false,
      showDeleteAction: false,
    })
    if (place && !place.canEditAddress) header.setEditing(false)
  })
})
</script>

{#snippet locationEditorActions()}
  {@render editorContent?.()}
  {#if request.current}
    <Button
      text="Map"
      iconComponent={MapPin}
      href={getAdminMapHref(
        admin.view.scope.prisms,
        'location',
        page.params.id ?? false,
        null,
        null,
        request.current,
      )}
      disabled={header.state.isEditing}
    />
  {/if}
{/snippet}

<Main.Root
  class="px-0 pt-0"
  onDimensionsChange={(width, height) =>
    admin.view.layout.setMainDimensions(width, height)}
>
  <Main.Facet
    edgeToEdge={true}
    fillHeight={true}
    class="top-0 bottom-0"
    contentClass="h-full overflow-hidden"
  >
    <FormSurface class="flex h-full min-h-0 flex-col overflow-hidden">
      {#await request}
        <AddressEditorSkeleton full />
      {:then place}
        {#if place}
          {#key place.id}
            <Tabs
              value={activeFacet === 'features' ? 'features' : 'record'}
              showList={false}
              label={m.location_record_views()}
              items={[
                { value: 'record', label: m.location_record_views() },
                { value: 'features', label: m.location_features_associated() },
              ]}
              class="h-full min-h-0"
              contentClass="h-full"
              panelClass="flex h-full min-h-0 flex-col"
            >
              {#snippet children(view)}
                {#if view === 'features'}
                  <ScopedFeatureIndex
                    resourceType="location"
                    active={activeFacet === 'features'}
                    resourceId={place.id}
                    embedded
                  />
                {:else}
                  <LocalLocationAddressEditor
                    recordView={activeFacet === 'relationships'
                      ? 'relationships'
                      : 'core'}
                    {place}
                    queryScope={scope}
                    isEditing={header.state.isEditing}
                    onEditingChange={value => header.setEditing(value)}
                    onControlsChange={controls => {
                      editorContent = controls.content ?? null
                      header.setFormActions({
                        ...controls,
                        content: locationEditorActions,
                      })
                    }}
                    onSaved={async () => {
                      await request.refresh()
                    }}
                  />
                {/if}
              {/snippet}
            </Tabs>
          {/key}
        {:else}
          <p class="px-6 py-6">{m.location_directory_empty()}</p>
        {/if}
      {:catch}
        <p role="alert" class="px-6 py-6">{m.resource_action_failed()}</p>
      {/await}
    </FormSurface>
  </Main.Facet>
</Main.Root>
