<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
import { getImportCtx, setImportCtx } from '$lib/context/import.svelte'
// BITS COMPONENTS
import * as Main from '$lib/bits/custom/main'
// COMPONENTS
import Dropzones from '$lib/bits/patterns/import/Dropzones.svelte'
import ImportFeatureFlow from '$lib/bits/patterns/import/ImportFeatureFlow.svelte'
import ImportImageFlow from '$lib/bits/patterns/import/ImportImageFlow.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// ICONS
import Upload from 'virtual:icons/lucide/upload'
// TYPES
import type {
  DropzoneEvent,
  ImportableResource,
} from '$lib/bits/patterns/import/import.types'

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
  headerCtrl.clearControlBar()
  headerCtrl.clearFooter()
})

// STATE

let importResourceType: ImportableResource | null = $state(null)
let pendingFeaturesDrop: DropzoneEvent | null = $state(null)
let pendingImagesDrop: DropzoneEvent | null = $state(null)

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

<Main.Root>
  <Main.Content>
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
  </Main.Content>
</Main.Root>
