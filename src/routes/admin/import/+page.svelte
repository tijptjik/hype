<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
import { getImportCtx, setImportCtx } from '$lib/context/import.svelte'
// COMPONENTS
import Dropzones from '$lib/components/import/Dropzones.svelte'
import ImportFeatureFlow from '$lib/components/import/features/ImportFeatureFlow.svelte'
import ImportImageFlow from '$lib/components/import/images/ImportImageFlow.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import Upload from 'virtual:icons/lucide/upload'
// TYPES
type ImportableResource = 'features' | 'users' | 'events' | 'images'
type DropContext = {
  acceptedFiles: File[]
  fileRejections?: unknown[]
  type: ImportableResource
  event?: Event
}
// CONTEXT
setImportCtx()

const adminCtx = getAdminCtx()
const appCtx = getAppCtx()
const headerCtrl = getHeaderCtrl()
const importCtx = getImportCtx()

adminCtx.setFacet(false, false, FirstClassResource.feature)
adminCtx.setResourceType(false)

// CONTEXT :: HEADER

$effect(() => {
  headerCtrl.setHeaderForIndex('Import', Upload, {
    showNew: false,
    showFilter: false,
    showFacets: false,
    showViewActions: false,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  headerCtrl.clearFooter()
})

// STATE

let importResourceType: ImportableResource | null = $state(null)
let pendingFeaturesDrop: DropContext | null = $state(null)
let pendingImagesDrop: DropContext | null = $state(null)

// HANDLERS

function handleDrop(event: {
  type: ImportableResource
  acceptedFiles: File[]
  fileRejections?: unknown[]
  event?: Event
}): void {
  importCtx.reset()
  resetPending()
  importResourceType = event.type
  if (importResourceType === 'features') {
    pendingFeaturesDrop = event
  } else if (importResourceType === 'images') {
    pendingImagesDrop = event
  }
}

function handleFlowCancel(): void {
  resetPending()
}

// UTILS
function resetPending(): void {
  importResourceType = null
  pendingFeaturesDrop = null
  pendingImagesDrop = null
}
</script>

<section class="bits-theme flex h-full min-h-0 flex-col overflow-y-auto p-6 pb-12">
  {#if importResourceType === 'features'}
    <ImportFeatureFlow
      {appCtx}
      {importCtx}
      pendingDrop={pendingFeaturesDrop}
      onCancel={handleFlowCancel}
    />
  {:else if importResourceType === 'images'}
    <ImportImageFlow
      {adminCtx}
      pendingDrop={pendingImagesDrop}
      onCancel={handleFlowCancel}
    />
  {:else}
    <Dropzones onDrop={handleDrop} isUploading={false} uploadProgress="" />
  {/if}
</section>
