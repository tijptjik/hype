<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import FeatureResolutionRow from './FeatureResolutionRow.svelte'
// SERVICES
import {
  canDownloadFeatureResolutionResults,
  downloadFeatureResolutionResults,
  getFeatureResolutionStatusCounts,
  includeFeatureResolutionRecord,
  processFeatureResolutionQueue,
  refreshFeatureResolution,
  retryFeatureResolutionRecord,
  skipFeatureResolutionRecord,
  toggleFeatureResolutionPreview,
  type FeatureResolutionData,
  type FeatureResolutionStatusCounts,
} from '$lib/client/services/import/features/resolution'

type Props = {
  startProcessing?: () => void
  downloadResultsAction?: () => void
  canDownloadResults?: boolean
  isProcessing?: boolean
  statusCounts?: FeatureResolutionStatusCounts
  footerStatus?: string
}

let {
  startProcessing = $bindable(),
  downloadResultsAction = $bindable(),
  canDownloadResults: canDownloadResultsBinding = $bindable(),
  isProcessing = $bindable(),
  statusCounts = $bindable(),
  footerStatus = $bindable(''),
}: Props = $props()

const importCtx = getImportCtx()

let hideUnchanged = $state(false)
let lastResolutionKey = $state('')
let copiedKey = $state<string | null>(null)
let copiedResetHandle: ReturnType<typeof setTimeout> | null = null

const resolution = $derived(importCtx.getFeatureResolution())
const results = $derived(resolution.results as FeatureResolutionData[])
const internalStatusCounts = $derived(getFeatureResolutionStatusCounts(results))
const canDownloadResults = $derived(canDownloadFeatureResolutionResults(results))

$effect(() => {
  statusCounts = internalStatusCounts
})

$effect(() => {
  const resolutionKey = `${importCtx.getFile()?.name ?? ''}:${resolution.ignoreMissingFeatureIds}`
  if (resolutionKey === lastResolutionKey) return
  lastResolutionKey = resolutionKey
  void refreshFeatureResolution(importCtx, resolution.ignoreMissingFeatureIds)
})

$effect(() => {
  startProcessing = () => processFeatureResolutionQueue(importCtx, results)
})

$effect(() => {
  isProcessing = resolution.isProcessing
})

$effect(() => {
  if (resolution.isProcessing) {
    footerStatus = m.feature_import__resolution_footer_processing({
      current: resolution.currentIndex + 1,
      total: resolution.total,
    })
    return
  }

  const total =
    internalStatusCounts.pending +
    internalStatusCounts.processing +
    internalStatusCounts.success +
    internalStatusCounts.error +
    internalStatusCounts.skipped +
    internalStatusCounts.unchanged
  const completed =
    internalStatusCounts.success +
    internalStatusCounts.error +
    internalStatusCounts.skipped +
    internalStatusCounts.unchanged

  footerStatus = total > 0 ? `${completed} / ${total}` : ''
})

$effect(() => {
  downloadResultsAction = () => downloadFeatureResolutionResults(importCtx, results)
})

$effect(() => {
  canDownloadResultsBinding = canDownloadResults
})

async function showPreview(index: number): Promise<void> {
  const shouldOpen = toggleFeatureResolutionPreview(importCtx, index)
  if (!shouldOpen) return

  await tick()
  const rowElement = document.querySelector<HTMLElement>(
    `[data-feature-resolution-row="${index}"]`,
  )
  rowElement?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function skipRecord(index: number): void {
  skipFeatureResolutionRecord(importCtx, results[index], index)
}

function includeRecord(index: number): void {
  includeFeatureResolutionRecord(importCtx, results[index], index)
}

function retryRecord(index: number): void {
  retryFeatureResolutionRecord(importCtx, results[index], index)
}

function setCopiedState(key: string): void {
  copiedKey = key
  if (copiedResetHandle) {
    clearTimeout(copiedResetHandle)
  }
  copiedResetHandle = setTimeout(() => {
    copiedKey = null
    copiedResetHandle = null
  }, 5000)
}

async function copyToClipboard(data: unknown, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopiedState(key)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
  }
}
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pt-4">
    {#each results as result, index (result.rowIndex)}
      <FeatureResolutionRow
        {result}
        {index}
        showPreview={resolution.showPreview && resolution.previewIndex === index}
        {hideUnchanged}
        {copiedKey}
        onShowPreview={showPreview}
        onSkip={skipRecord}
        onInclude={includeRecord}
        onRetry={retryRecord}
        onHideUnchangedChange={checked => {
          hideUnchanged = checked
        }}
        onCopy={copyToClipboard}
      />
    {/each}
  </div>
</div>
