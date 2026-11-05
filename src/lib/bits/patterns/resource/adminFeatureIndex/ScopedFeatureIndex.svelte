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
import { createScopedFeatureView } from '#lib/client/services/scopedFeatureView.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
import AdminFeatureIndex from './AdminFeatureIndex.svelte'
import ScopedFeatureControls from './ScopedFeatureControls.svelte'
// TYPES
import type { FeaturePrismResource } from '#lib/client/services/scopedFeatureView.js'

let {
  resourceType,
  resourceId,
  embedded = false,
}: {
  resourceType: FeaturePrismResource
  resourceId: string
  embedded?: boolean
} = $props()

const parent = getAdminCtx()
const parentHeader = getHeaderCtrl()
// The owning route keys this component by entity ID and mounts it only on #features.
const view = setSurfaceCtx(
  untrack(() => createScopedFeatureView(parent.view, resourceType, resourceId)),
)
const adminCtx = setAdminCtx(view)
adminCtx.listUi.state.isControlBarVisible.feature = embedded
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
  parentHeader.setSearch({
    indexView: true,
    resourceType: FirstClassResource.feature,
    listUi: adminCtx.listUi,
    query: view.filters.values.feature.text ?? '',
    onFilter: value => {
      view.filters.values.feature.text = value
    },
  })
  const region = headerCtrl.state.layout.controlBar
  if (region?.component) {
    parentHeader.setControlBar(
      ScopedFeatureControls,
      { adminCtx, region },
      { isVisible: adminCtx.listUi.state.isControlBarVisible.feature },
    )
  }
})

$effect(() => {
  if (embedded) headerCtrl.isSearchFocused = parentHeader.isSearchFocused
})

onDestroy(() => {
  if (embedded) {
    // A replacement index may already own the shared header when this one unmounts.
    if (parentHeader.state.search?.listUi === adminCtx.listUi) {
      parentHeader.setSearch(null)
    }
    if (parentHeader.state.layout.controlBar?.props?.adminCtx === adminCtx) {
      parentHeader.clearControlBar()
    }
  }
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
    <AdminFeatureIndex showTotalCount />
  </div>
</div>
