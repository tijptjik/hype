<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { untrack, type Snippet } from 'svelte'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import { DestructiveDialog } from '#lib/bits/core/dialog/index.js'
import Tabs from '#lib/bits/core/tabs/Tabs.svelte'
import * as Main from '#lib/bits/custom/main/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import LocalLocationAddressEditor from '#lib/bits/patterns/forms/localLocationAddress/LocalLocationAddressEditor.svelte'
import LocationInteriorEditor from '#lib/bits/patterns/forms/localLocationAddress/LocationInteriorEditor.svelte'
import LocationExteriorMap from '#lib/bits/patterns/forms/localLocationAddress/LocationExteriorMap.svelte'
// NAVIGATION
import { getAdminMapHref } from '#lib/navigation/adminMapLink.js'
import { bindAdminFacetHistorySync } from '#lib/client/services/form.js'
import { getAdminFacetTabsForResource } from '#lib/navigation/index.js'
import { FirstClassResource } from '#lib/enums.js'
import ScopedFeatureIndex from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndex.svelte'
// API
import { deleteLocation, getLocation } from '#lib/api/locationDirectory.remote.js'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// I18N
import { buildingNameLabel } from '#lib/locations/kinds.i18n.js'
import { getLocale, m } from '#lib/i18n.js'
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
  getFacetOrder: () =>
    request.current?.kind === 'building'
      ? ['core', 'relationships', 'interior', 'exterior', 'features']
      : ['core', 'relationships', 'features'],
  getActiveFacet: () => admin.activeFacet,
  adminCtx: admin,
  resourceType: FirstClassResource.location,
  getResourceRef: () => page.params.id ?? '',
})
const facetTabs = $derived.by(() => {
  const tabs = getAdminFacetTabsForResource(FirstClassResource.location)
  if (request.current?.kind !== 'building') {
    tabs.delete('interior')
    tabs.delete('exterior')
  }
  return tabs
})
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
let deleteTarget = $state<{
  id: string
  revisionId: string
  draftVersion?: string | null
  name: string
} | null>(null)
let confirmingDelete = $state(false)
let deleting = $state(false)
let deleteError = $state('')

/** Pin the record and revision displayed when the editor opened its title menu.
 * @returns Nothing.
 */
function confirmDeletion(): void {
  const place = request.current
  if (!place?.canDelete || !place.revisionId || place.id !== page.params.id || deleting)
    return
  deleteTarget = {
    id: place.id,
    revisionId: place.revisionId,
    draftVersion: place.draftVersion,
    name: header.state.meta.title || place.id,
  }
  deleteError = ''
  confirmingDelete = true
}

/** Remove the reviewed identity and return to the directory after the server commits.
 * @returns Completion of the delete command and navigation.
 */
async function submitDeletion(): Promise<void> {
  const target = deleteTarget
  if (!target || target.id !== page.params.id || deleting) return
  deleting = true
  try {
    const result = await deleteLocation({
      locationId: target.id,
      revisionId: target.revisionId,
      draftVersion: target.draftVersion,
    }).updates(request)
    if (result === 'deleted') admin.view.cache.location.delete(target.id)
    if (page.params.id !== target.id) return
    if (result === 'deleted') {
      const directory = new URL('/admin/locations', page.url)
      const organisationId = page.url.searchParams.get('organisation')
      if (organisationId) directory.searchParams.set('organisationId', organisationId)
      await goto(directory, { replaceState: true, invalidateAll: true })
    } else {
      deleteError =
        result === 'in-use'
          ? m.location_delete_in_use()
          : result === 'changed'
            ? m.location_delete_changed()
            : m.location_delete_migration()
    }
  } catch {
    if (page.params.id === target.id) deleteError = m.resource_action_failed()
  } finally {
    deleting = false
  }
}
// Route changes discard the old record's edit mode before applying explicit edit intent.
$effect(() => {
  const id = page.params.id
  confirmingDelete = false
  deleteTarget = null
  deleteError = ''
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
  const locale = getLocale().toLowerCase()
  // Match the community record displayed by the standalone editor, even with Organisation context.
  const facts =
    place?.state === 'manual' ? place.facts : (place?.sharedFacts ?? place?.facts)
  const title =
    place?.kind === 'building'
      ? buildingNameLabel(facts?.names ?? {}, facts?.confirmedUnnamed, locale)
      : facts?.names[locale] ||
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
      showDeleteAction: Boolean(place?.canDelete && place.id === page.params.id),
      toggleDelete: confirmDeletion,
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

<DestructiveDialog
  bind:open={confirmingDelete}
  confirmText={m.forms__delete()}
  onConfirm={submitDeletion}
>
  {#snippet title()}
    {m.location_delete_title({ name: deleteTarget?.name ?? '' })}
  {/snippet}
  {#snippet description()}
    {m.location_delete_description()}
  {/snippet}
</DestructiveDialog>
{#if deleteError}
  <p role="alert" class="px-6 py-3">{deleteError}</p>
{/if}

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
              value={activeFacet === 'features' ||
              (place.kind === 'building' &&
                (activeFacet === 'interior' || activeFacet === 'exterior'))
                ? activeFacet
                : 'record'}
              showList={false}
              label={m.location_record_views()}
              items={[
                { value: 'record', label: m.location_record_views() },
                { value: 'features', label: m.location_features_associated() },
                ...(place.kind === 'building'
                  ? [
                      { value: 'interior', label: 'Interior' },
                      { value: 'exterior', label: 'Exterior' },
                    ]
                  : []),
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
                {:else if view === 'interior'}
                  <LocationInteriorEditor
                    locationId={place.id}
                    isEditing={header.state.isEditing}
                  />
                {:else if view === 'exterior'}
                  {#if place.facts?.location.geometry.coordinates}
                    <LocationExteriorMap
                      locationId={place.id}
                      coordinates={place.facts.location.geometry.coordinates}
                      facts={place.state === 'manual'
                        ? place.facts
                        : (place.sharedFacts ?? place.facts)}
                    />
                  {:else}
                    <p class="text-muted-foreground p-6 text-sm">
                      No building coordinates are available.
                    </p>
                  {/if}
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
                        showDeleteAction: Boolean(
                          place.canDelete && !controls.isSubmitting,
                        ),
                        toggleDelete: confirmDeletion,
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
