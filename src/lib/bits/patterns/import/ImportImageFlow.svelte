<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// PATTERN COMPONENTS
import * as ImportPrimitive from './components'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import type { AdminCtx } from '$lib/context/admin.svelte'
// SERVICES
import {
  handleImageDropEvent,
  processSingleUpload,
} from '$lib/client/services/import/images'
// TYPES
import type { BatchUploadResult } from '$lib/client/services/import/types'

type Props = {
  adminCtx: AdminCtx
  pendingDrop: {
    acceptedFiles: File[]
    fileRejections?: unknown[]
    type: 'features' | 'users' | 'events' | 'images'
    event?: Event
  } | null
  onCancel: () => void
}

let { adminCtx, pendingDrop, onCancel }: Props = $props()

// IMAGE UPLOAD STATE
let uploadResults: BatchUploadResult[] = $state([])
let isUploading = $state(false)
let currentBatch = $state(0)
let totalBatches = $state(0)
let imageUploadSessionId = $state(0)
let lastProcessedDrop = $state<Props['pendingDrop']>(null)

let successCount = $derived(
  uploadResults.filter(result => result.status === 'success').length,
)
let errorCount = $derived(
  uploadResults.filter(
    result => result.status === 'error' || result.status === 'conflict',
  ).length,
)
let uploadingCount = $derived(
  uploadResults.filter(result => result.status === 'uploading').length,
)
let pendingCount = $derived(
  uploadResults.filter(result => result.status === 'pending').length,
)

$effect(() => {
  if (!pendingDrop || pendingDrop === lastProcessedDrop) return

  lastProcessedDrop = pendingDrop
  handleImageDropEventWrapper(pendingDrop)
})

// Handle image drop wrapper
function handleImageDropEventWrapper(event: {
  acceptedFiles: File[]
  fileRejections?: unknown[]
}): void {
  const activeSessionId = ++imageUploadSessionId

  handleImageDropEvent(
    new CustomEvent('drop', {
      detail: {
        acceptedFiles: event.acceptedFiles,
        fileRejections: event.fileRejections ?? [],
      },
    }),
    adminCtx,
    results => {
      if (activeSessionId !== imageUploadSessionId) return
      uploadResults = results
    },
    uploading => {
      if (activeSessionId !== imageUploadSessionId) return
      isUploading = uploading
    },
    (current, total) => {
      if (activeSessionId !== imageUploadSessionId) return
      currentBatch = current
      totalBatches = total
    },
  )
}

function resetImageUploadState(): void {
  imageUploadSessionId += 1
  uploadResults = []
  isUploading = false
  currentBatch = 0
  totalBatches = 0
}

async function handleReplaceUpload(resultId: string): Promise<void> {
  const index = uploadResults.findIndex(result => result.id === resultId)
  if (index === -1) return

  const result = uploadResults[index]
  if (
    !result.featureId ||
    (!result.existingDuplicateImage && !result.existingCanonicalImage)
  ) {
    return
  }

  isUploading = true

  try {
    await processSingleUpload(
      result,
      index,
      uploadResults,
      new Map(),
      results => {
        uploadResults = results
      },
      () => 'Replace requested but the feature could not be resolved.',
      { replaceExisting: true },
    )
  } finally {
    isUploading = false
  }
}

function handleImageUploadCancel(): void {
  resetImageUploadState()
  onCancel()
}
</script>

<div class="min-h-0 flex-1" in:fade={{ duration: 300 }}>
  {#if uploadResults.length > 0}
    <ImportPrimitive.UploadWorkspace
      {uploadResults}
      {successCount}
      {errorCount}
      {uploadingCount}
      {pendingCount}
      {currentBatch}
      {totalBatches}
      {isUploading}
      onCancel={handleImageUploadCancel}
      onReplace={handleReplaceUpload}
    />
  {:else}
    <div
      class="flex h-full min-h-[20rem] items-center justify-center rounded-2xl border border-base-content/15 bg-glass-result px-6 py-10 text-center shadow-xl"
    >
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">{m.batch_upload__results()}</h3>
        <p class="text-sm text-base-content/70">
          Preparing the upload queue for the dropped image files.
        </p>
      </div>
    </div>
  {/if}
</div>
