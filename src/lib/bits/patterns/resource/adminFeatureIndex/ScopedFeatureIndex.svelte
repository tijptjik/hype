<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { toast } from 'svelte-sonner'
// ADAPTERS
import { useAdminHeaderModel } from '#lib/adapters/header/useAdminHeaderModel.svelte.js'
// CONTEXT
import { getAdminCtx, setAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl, setHeaderCtrl } from '#lib/context/header.svelte.js'
import { setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// SERVICES
import { navigateOnAdmin } from '#lib/navigation/admin.js'
import { NEW_REF } from '#lib/constants.js'
import { createScopedFeatureView } from '#lib/client/services/scopedFeatureView.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
import AdminFeatureIndex from './AdminFeatureIndex.svelte'
import ScopedFeatureControls from './ScopedFeatureControls.svelte'
import LocationFeatureViewFilter from './LocationFeatureViewFilter.svelte'
// TYPES
import type { FeatureIndexQuery } from '#lib/features/indexQuery.js'
import type { FeaturePrismResource } from '#lib/client/services/scopedFeatureView.js'

let {
  resourceType,
  resourceId,
  embedded = false,
  active = true,
}: {
  resourceType: FeaturePrismResource
  resourceId: string
  embedded?: boolean
  active?: boolean
} = $props()

let locationView = $state<'associated' | 'placed' | 'past'>('associated')
const locationScope = $derived<FeatureIndexQuery['location']>(
  resourceType === 'location' ? { id: resourceId, view: locationView } : undefined,
)
const parent = getAdminCtx()
const parentHeader = getHeaderCtrl()
// The owning route keys by entity ID; retained panels publish header controls only while active.
const view = setSurfaceCtx(
  untrack(() => createScopedFeatureView(parent.view, resourceType, resourceId)),
)
const adminCtx = setAdminCtx(view)
adminCtx.listUi.state.isControlBarVisible.feature = untrack(() => embedded)
const headerCtrl = setHeaderCtrl()
const headerModel = useAdminHeaderModel(view, adminCtx)
const headerProps = $derived(headerModel.getHeaderProps())

$effect(() => {
  parent.view.account.revision
  let active = true
  untrack(() => {
    view.syncAccount()
    // Load field-filter definitions for this prism independently of feature paging.
    void view.queries.refreshProperties(false).catch(() => {
      if (active) toast.error(m.bootstrap__error())
    })
  })
  return () => {
    active = false
  }
})

/**
 * Open feature creation with this view's parent hierarchy selected.
 * @returns Completion after resolving the parent IDs and starting navigation.
 */
async function createFeature(): Promise<void> {
  if (resourceType === 'location' || resourceType === 'brand') return
  try {
    const selection: Record<string, string> = {}
    if (resourceType === 'organisation') {
      selection.organisationId = resourceId
    } else {
      const entity =
        resourceType === 'layer'
          ? await parent.view.getLayerById(resourceId)
          : await parent.view.getProjectById(resourceId)
      if (!entity) throw new Error('Parent resource is unavailable')
      selection.organisationId = entity.organisationId
      if (resourceType === 'layer' && 'projectId' in entity) {
        selection.projectId = entity.projectId
        selection.layerId = resourceId
      } else {
        selection.projectId = resourceId
      }
    }
    navigateOnAdmin(parent, FirstClassResource.feature, NEW_REF, 'core', selection)
  } catch {
    toast.error(m.bootstrap__error())
  }
}

// Keep native collection updates local, including optimistic bulk changes.
$effect(() => {
  const query = view.cacheCtx.featureCollection
  const current = query?.current
  if (current && adminCtx.featureIndexReady) {
    untrack(() => adminCtx.syncFeatureCollection(query, current))
  }
})

// Publish the scoped controls into the entity header without replacing its tabs.
$effect(() => {
  if (!embedded) return
  if (!active) {
    releaseHeaderControls()
    return
  }
  parentHeader.setSearch({
    indexView: true,
    resourceType: FirstClassResource.feature,
    listUi: adminCtx.listUi,
    query: view.filters.values.feature.text ?? '',
    onFilter: value => {
      view.filters.values.feature.text = value
    },
  })
  // Relationship selection belongs beside the header's filter toggle, independently of the filter bar.
  if (locationScope) {
    parentHeader.setViewActionContent(LocationFeatureViewFilter, {
      value: locationScope.view,
      onChange: (value: 'associated' | 'placed' | 'past') => {
        locationView = value
      },
    })
  }
  const region = headerCtrl.state.layout.controlBar
  if (region?.component) {
    parentHeader.setControlBar(
      ScopedFeatureControls,
      { adminCtx, region },
      {
        isVisible: adminCtx.listUi.state.isControlBarVisible.feature,
      },
    )
  }
})

$effect(() => {
  if (embedded && active) headerCtrl.isSearchFocused = parentHeader.isSearchFocused
})

/** Release only the shared header controls owned by this scoped view.
 * @returns Nothing; another mounted index keeps its own controls.
 */
function releaseHeaderControls(): void {
  if (embedded) {
    // A replacement index may already own the shared header when this one unmounts.
    if (parentHeader.state.search?.listUi === adminCtx.listUi) {
      parentHeader.setSearch(null)
      if (resourceType === 'location') parentHeader.setViewActionContent(null, {})
    }
    if (parentHeader.state.layout.controlBar?.props?.adminCtx === adminCtx) {
      parentHeader.clearControlBar()
    }
  }
}

onDestroy(() => {
  releaseHeaderControls()
  view.dispose()
})
</script>

<div
  class="bits-theme @container/features flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
>
  {#if !embedded}
    <h2
      class="text-muted-foreground px-6 pt-3 text-sm font-medium @min-[640px]/features:hidden"
    >
      {headerProps.title?.text}
    </h2>
    <Header
      {...headerProps}
      class="[&_[data-header-title-text]]:text-muted-foreground! [&_[data-header-title-text]]:text-sm! [&_[data-header-title-text]]:font-medium! [&>header]:h-14! @max-[640px]/features:[&>header>div:first-child]:hidden"
      avatar={{ isVisible: false }}
      newAction={{ isCreatable: false }}
    />
  {/if}
  <div class="relative flex min-h-0 flex-1 flex-col">
    <AdminFeatureIndex
      showTotalCount
      {locationScope}
      brandId={resourceType === 'brand' ? resourceId : undefined}
      readOnly={resourceType === 'location' || resourceType === 'brand'}
      onCreate={resourceType === 'location' || resourceType === 'brand'
        ? undefined
        : createFeature}
    />
  </div>
</div>
