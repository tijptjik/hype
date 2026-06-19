<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// PATTERN COMPONENTS
import * as ImportPrimitive from './components'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import type { AdminCtx } from '$lib/context/admin.svelte'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ArrowDownTray from 'virtual:icons/lucide/download'
// SERVICES
import {
  downloadImageUploadResults,
  handleImageDropEvent,
  processSingleUpload,
} from '$lib/client/services/import/images'
// TYPES
import type { BatchUploadResult } from '$lib/client/services/import/types'
import type { DropzoneEvent } from './import.types'

type Props = {
  adminCtx: AdminCtx
  pendingDrop: DropzoneEvent | null
  onCancel: () => void
}

let { adminCtx, pendingDrop, onCancel }: Props = $props()

// IMPORT :: ORCHESTRATION

let uploadResults: BatchUploadResult[] = $state([])
let isUploading = $state(false)
let currentBatch = $state(0)
let totalBatches = $state(0)
let imageUploadSessionId = $state(0)
let lastProcessedDrop = $state<Props['pendingDrop']>(null)
let currentPhase = $state<'uploading' | 'finished'>('uploading')
let replacingResultIds = $state(new Set<string>())

// IMPORT :: STATS

let successCount = $derived(
  uploadResults.filter(result => result.status === 'success').length,
)
let errorCount = $derived(
  uploadResults.filter(result => result.status === 'error').length,
)
let duplicateCount = $derived(
  uploadResults.filter(result => result.status === 'conflict').length,
)
let uploadingCount = $derived(
  uploadResults.filter(result => result.status === 'uploading').length,
)
let pendingCount = $derived(
  uploadResults.filter(result => result.status === 'pending').length,
)
let totalCount = $derived(uploadResults.length)
let completedCount = $derived(successCount + errorCount + duplicateCount)
let canQueueReplacements = $derived(
  currentPhase === 'uploading' && totalCount > 0 && pendingCount === 0 && !isUploading,
)
let canAdvanceToFinished = $derived(
  totalCount > 0 &&
    pendingCount === 0 &&
    uploadingCount === 0 &&
    !isUploading &&
    replacingResultIds.size === 0,
)
let progressValue = $derived(
  totalCount === 0 ? null : (completedCount / totalCount) * 100,
)
let headerStats = $derived([
  { label: m.batch_upload__success(), value: successCount, tone: 'success' as const },
  {
    label: m.batch_upload__errors(),
    value: errorCount,
    tone: errorCount > 0 ? ('error' as const) : ('neutral' as const),
  },
  {
    label: m.batch_upload__duplicates(),
    value: duplicateCount,
    tone: duplicateCount > 0 ? ('warning' as const) : ('neutral' as const),
  },
  {
    label: m.batch_upload__uploading(),
    value: uploadingCount,
    tone: uploadingCount > 0 ? ('warning' as const) : ('neutral' as const),
  },
  {
    label: m.batch_upload__pending(),
    value: pendingCount,
    tone: pendingCount > 0 ? ('info' as const) : ('neutral' as const),
  },
])
let dataLabel = $derived(
  `${pendingDrop?.acceptedFiles.length ?? totalCount} FILE${(pendingDrop?.acceptedFiles.length ?? totalCount) === 1 ? '' : 'S'}`,
)

// HANDLERS

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

function handleImageUploadCancel(): void {
  resetImageUploadState()
  onCancel()
}

function handleBack(): void {
  if (currentPhase === 'finished') {
    currentPhase = 'uploading'
    return
  }
  handleImageUploadCancel()
}

function handleContinue(): void {
  if (currentPhase === 'finished') {
    handleImageUploadCancel()
    return
  }
  if (canAdvanceToFinished) {
    currentPhase = 'finished'
  }
}
async function handleReplaceUpload(resultId: string): Promise<void> {
  if (!canQueueReplacements) return
  if (replacingResultIds.has(resultId)) return

  const index = uploadResults.findIndex(result => result.id === resultId)
  if (index === -1) return

  const result = uploadResults[index]
  if (
    !result.featureId ||
    (!result.existingDuplicateImage && !result.existingCanonicalImage)
  ) {
    return
  }

  replacingResultIds = new Set(replacingResultIds).add(resultId)
  const uploadingResult: BatchUploadResult = {
    ...result,
    status: 'uploading',
    error: undefined,
  }
  uploadResults = uploadResults.map(currentResult =>
    currentResult.id === resultId ? uploadingResult : currentResult,
  )

  try {
    await processSingleUpload(
      uploadingResult,
      0,
      [uploadingResult],
      new Map(),
      results => {
        const [updatedResult] = results
        if (!updatedResult) return

        uploadResults = uploadResults.map(currentResult =>
          currentResult.id === resultId ? updatedResult : currentResult,
        )
      },
      () => 'Replace requested but the feature could not be resolved.',
      { replaceExisting: true },
    )
  } finally {
    const nextReplacingResultIds = new Set(replacingResultIds)
    nextReplacingResultIds.delete(resultId)
    replacingResultIds = nextReplacingResultIds
  }
}

// UTILS

function resetImageUploadState(): void {
  imageUploadSessionId += 1
  uploadResults = []
  isUploading = false
  currentBatch = 0
  totalBatches = 0
  currentPhase = 'uploading'
  replacingResultIds = new Set()
}

// EFFECTS

$effect(() => {
  if (!pendingDrop || pendingDrop === lastProcessedDrop) return

  lastProcessedDrop = pendingDrop
  currentPhase = 'uploading'
  handleImageDropEventWrapper(pendingDrop)
})
</script>

<div class="min-h-0 flex-1" in:fade={{ duration: 300 }}>
  <ImportPrimitive.Root>
    <ImportPrimitive.Header
      title={currentPhase === 'finished'
        ? m.batch_upload__import_complete()
        : m.batch_upload__results()}
      subtitle={currentPhase === 'finished'
        ? m.batch_upload__finished_subtitle()
        : m.batch_upload__active_subtitle()}
      {dataLabel}
      stats={uploadResults.length > 0 ? headerStats : []}
      {progressValue}
    />

    <ImportPrimitive.Body>
      {#if uploadResults.length === 0}
        <ImportPrimitive.Canvas
          class="flex h-full min-h-80 items-center justify-center text-center"
        >
          <div class="space-y-2">
            <h3 class="text-lg font-semibold">{m.batch_upload__results()}</h3>
            <p class="text-sm text-base-content/70">
              {m.batch_upload__preparing_queue()}
            </p>
          </div>
        </ImportPrimitive.Canvas>
      {:else if currentPhase === 'finished'}
        <ImportPrimitive.Canvas
          class="flex h-full min-h-112 items-center justify-center"
        >
          <div class="flex max-w-md flex-col items-center gap-5 text-center">
            <button
              type="button"
              class="rounded-full border border-primary/20 bg-primary/10 p-6 text-primary transition-colors hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/30"
              onclick={() => downloadImageUploadResults(uploadResults)}
              title={m.batch_upload__download_results()}
            >
              <Icon src={ArrowDownTray} class="h-12 w-12" />
            </button>
            <div class="space-y-2">
              <h3 class="text-2xl font-semibold">
                {m.batch_upload__import_complete()}
              </h3>
              <p class="text-sm text-base-content/70">
                {m.batch_upload__finished_subtitle()}
              </p>
            </div>
          </div>
        </ImportPrimitive.Canvas>
      {:else}
        <ImportPrimitive.Rows>
          {#each uploadResults as result, index (result.id)}
            <ImportPrimitive.UploadResult
              {result}
              {index}
              onReplace={handleReplaceUpload}
              replaceDisabled={!canQueueReplacements || replacingResultIds.has(result.id)}
            />
          {/each}
        </ImportPrimitive.Rows>
      {/if}
    </ImportPrimitive.Body>

    <ImportPrimitive.Footer
      onBack={handleBack}
      onContinue={handleContinue}
      continueLabel={currentPhase === 'finished'
        ? m.batch_upload__finish()
        : canAdvanceToFinished
          ? m.batch_upload__continue()
          : isUploading
            ? m.batch_upload__uploading_batch({
                current: Math.max(currentBatch, 1),
                total: Math.max(totalBatches, 1),
              })
            : m.batch_upload__processing()}
      continueDisabled={currentPhase === 'finished' ? false : !canAdvanceToFinished}
      rightMetaText={currentPhase === 'finished'
        ? ''
        : totalCount > 0
          ? `${completedCount} / ${totalCount}`
          : ''}
      showPips={false}
    />
  </ImportPrimitive.Root>
</div>
