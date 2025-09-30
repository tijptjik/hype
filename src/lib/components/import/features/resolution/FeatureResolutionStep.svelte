<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  CheckCircle,
  XCircle,
  ArrowPath,
  Eye,
  ArrowDownTray,
  Play,
  Pause,
  ClipboardDocument,
  MapPin
} from '@steeze-ui/heroicons';
// SERVICES
import {
  initializeFeatureResolution,
  processFeatureResolution,
  generateDownloadData,
  type FeatureResolutionData
} from '$lib/client/services/import/features/resolution';

// PROPS - Expose startProcessing and statusCounts to parent
type Props = {
  startProcessing?: () => void;
  statusCounts?: {
    pending: number;
    processing: number;
    success: number;
    error: number;
    skipped: number;
    unchanged: number;
  };
};

let { startProcessing = $bindable(), statusCounts = $bindable() }: Props = $props();

// CONTEXT
const importCtx = getImportCtx();

// STATE
let isInitialized = $state(false);
let hideUnchanged = $state(false);

// Initialize resolution data when component mounts
$effect(() => {
  if (!isInitialized) {
    (async () => {
      try {
        const results = await initializeFeatureResolution(importCtx);
        importCtx.setFeatureResolutionResults(results);
        importCtx.updateFeatureResolution({
          total: results.length,
          currentIndex: 0
        });
        isInitialized = true;
      } catch (error) {
        console.error('Failed to initialize feature resolution:', error);
        // Set empty results to avoid hanging
        importCtx.setFeatureResolutionResults([]);
        importCtx.updateFeatureResolution({
          total: 0,
          currentIndex: 0
        });
        isInitialized = true;
      }
    })();
  }
});

// COMPUTED
const resolution = $derived(importCtx.getFeatureResolution());
const results = $derived(resolution.results as FeatureResolutionData[]);
const currentResult = $derived(results[resolution.previewIndex]);

const internalStatusCounts = $derived({
  pending: results.filter((r) => r.status === 'pending').length,
  processing: results.filter((r) => r.status === 'processing').length,
  success: results.filter((r) => r.status === 'success').length,
  error: results.filter((r) => r.status === 'error').length,
  skipped: results.filter((r) => r.status === 'skipped').length,
  unchanged: results.filter((r) => r.status === 'unchanged').length
});

// Update bindable statusCounts
$effect(() => {
  statusCounts = internalStatusCounts;
});

// HELPERS
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return obj1 === obj2;
  if (typeof obj1 !== typeof obj2) return false;
  if (typeof obj1 !== 'object') return obj1 === obj2;
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!deepEqual(obj1[i], obj2[i])) return false;
    }
    return true;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

function renderDiffView(existing: any, merged: any, hideUnchanged: boolean): string {
  function renderValue(
    key: string,
    existingVal: any,
    mergedVal: any,
    indent: number = 0
  ): string {
    const indentStr = '  '.repeat(indent);
    const isChanged = !deepEqual(existingVal, mergedVal);
    const opacity = isChanged ? 'opacity-100' : 'opacity-50';

    if (hideUnchanged && !isChanged) {
      return '';
    }

    if (Array.isArray(mergedVal)) {
      const existingArray = Array.isArray(existingVal) ? existingVal : [];
      let result = `${indentStr}<span class="${opacity}">${JSON.stringify(key)}: [</span>\n`;

      let validItems = [];

      for (let i = 0; i < mergedVal.length; i++) {
        const mergedItem = mergedVal[i];
        let existingItem;

        // Smart comparison: first try featureId+propertyId, then id, then index
        if (mergedItem && typeof mergedItem === 'object') {
          if (mergedItem.featureId && mergedItem.propertyId) {
            existingItem = existingArray.find(
              (item) =>
                item?.featureId === mergedItem.featureId &&
                item?.propertyId === mergedItem.propertyId
            );
          } else if (mergedItem.id) {
            existingItem = existingArray.find((item) => item?.id === mergedItem.id);
          }
        }

        // Fallback to index-based comparison
        if (!existingItem) {
          existingItem = existingArray[i];
        }

        if (
          mergedItem &&
          typeof mergedItem === 'object' &&
          (mergedItem.id || mergedItem.featureId)
        ) {
          // Object with ID or featureId - compare appropriately
          const itemChanged = !deepEqual(existingItem, mergedItem);
          if (!hideUnchanged || itemChanged) {
            let itemResult = `${indentStr}  {\n`;

            // Show identifying fields in grey if not hiding unchanged
            if (!hideUnchanged) {
              if (mergedItem.id) {
                itemResult += `${indentStr}    <span class="opacity-30">"id": ${JSON.stringify(mergedItem.id)},</span>\n`;
              }
              if (mergedItem.featureId) {
                itemResult += `${indentStr}    <span class="opacity-30">"featureId": ${JSON.stringify(mergedItem.featureId)},</span>\n`;
              }
              if (mergedItem.propertyId) {
                itemResult += `${indentStr}    <span class="opacity-30">"propertyId": ${JSON.stringify(mergedItem.propertyId)},</span>\n`;
              }
            }

            const nonIdKeys = Object.keys(mergedItem).filter(
              (k) => !['id', 'featureId', 'propertyId'].includes(k)
            );

            nonIdKeys.forEach((objKey, keyIndex) => {
              const objResult = renderValue(
                objKey,
                existingItem?.[objKey],
                mergedItem[objKey],
                indent + 2
              );
              if (objResult) {
                itemResult += objResult;
                if (keyIndex < nonIdKeys.length - 1) itemResult += ',';
                itemResult += '\n';
              }
            });

            itemResult += `${indentStr}  }`;
            validItems.push(itemResult);
          }
        } else {
          // Primitive value or object without identifying fields
          const itemChanged = !deepEqual(existingItem, mergedItem);
          const itemOpacity = itemChanged ? 'opacity-100' : 'opacity-50';
          if (!hideUnchanged || itemChanged) {
            validItems.push(
              `${indentStr}  <span class="${itemOpacity}">${JSON.stringify(mergedItem, null, 2).replace(/\n/g, `\n${indentStr}  `)}</span>`
            );
          }
        }
      }

      // Join valid items with commas, but no trailing comma
      if (validItems.length > 0) {
        result += validItems.join(',\n') + '\n';
      }

      result += `${indentStr}<span class="${opacity}">]</span>`;
      return result;
    } else if (mergedVal && typeof mergedVal === 'object') {
      let result = `${indentStr}<span class="${opacity}">${JSON.stringify(key)}: {</span>\n`;

      Object.keys(mergedVal).forEach((objKey) => {
        const objResult = renderValue(
          objKey,
          existingVal?.[objKey],
          mergedVal[objKey],
          indent + 1
        );
        if (objResult) {
          result += objResult + ',\n';
        }
      });

      result += `${indentStr}<span class="${opacity}">}</span>`;
      return result;
    } else {
      return `${indentStr}<span class="${opacity}">${JSON.stringify(key)}: ${JSON.stringify(mergedVal)}</span>`;
    }
  }

  let html = '<pre class="text-xs">{\n';
  Object.keys(merged).forEach((key, index) => {
    const result = renderValue(key, existing[key], merged[key], 1);
    if (result) {
      html += result;
      if (index < Object.keys(merged).length - 1) html += ',';
      html += '\n';
    }
  });
  html += '}</pre>';

  return html;
}

function getFeatureDisplayName(result: FeatureResolutionData): string {
  // Try to get title from submitted data first
  const submittedTitle =
    result.submitted?.i18n?.en?.title || result.submitted?.i18n?.['zh-hant']?.title;
  if (submittedTitle) {
    return submittedTitle;
  }

  // Try to get title from merged data
  const mergedTitle =
    result.merged?.i18n?.en?.title || result.merged?.i18n?.['zh-hant']?.title;
  if (mergedTitle) {
    return mergedTitle;
  }

  // Try to get title from existing data
  const existingTitle =
    result.existing?.i18n?.en?.title || result.existing?.i18n?.['zh-hant']?.title;
  if (existingTitle) {
    return existingTitle;
  }

  // Fallback to row number
  return `Row ${result.rowIndex + 2}`;
}

// ACTIONS
async function internalStartProcessing() {
  importCtx.updateFeatureResolution({ isProcessing: true, currentIndex: 0 });

  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 'pending') continue;

    importCtx.updateFeatureResolution({ currentIndex: i });

    try {
      const updatedResult = await processFeatureResolution(results[i], importCtx);
      importCtx.updateFeatureResolutionResult(i, updatedResult);
    } catch (error) {
      const errorResult = {
        ...results[i],
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      importCtx.updateFeatureResolutionResult(i, errorResult);
    }
  }

  importCtx.updateFeatureResolution({ isProcessing: false });
}

// Update bindable startProcessing
$effect(() => {
  startProcessing = internalStartProcessing;
});

function pauseProcessing() {
  importCtx.updateFeatureResolution({ isProcessing: false });
}

function showPreview(index: number) {
  const result = results[index];
  const featureId = result?.submitted?.feature?.id;
  const isTargetId =
    featureId &&
    ['aveKsX1ch7Ud', 'HpIyPtWUffXJ', 'D6f5_izBoOHu', 'pb7SrfBqh6-I'].includes(
      featureId
    );

  if (isTargetId) {
  }

  importCtx.updateFeatureResolution({
    showPreview: true,
    previewIndex: index
  });
}

function hidePreview() {
  importCtx.updateFeatureResolution({ showPreview: false });
}

function skipRecord(index: number) {
  const updatedResult = {
    ...results[index],
    status: 'skipped' as const
  };
  importCtx.updateFeatureResolutionResult(index, updatedResult);
}

function includeRecord(index: number) {
  const updatedResult = {
    ...results[index],
    status: 'pending' as const
  };
  importCtx.updateFeatureResolutionResult(index, updatedResult);
}

function retryRecord(index: number) {
  const updatedResult = {
    ...results[index],
    status: 'pending' as const,
    error: undefined
  };
  importCtx.updateFeatureResolutionResult(index, updatedResult);
}

function downloadResults() {
  const columns = importCtx.getColumns();
  const downloadData = generateDownloadData(results, columns);
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(':', '-');
  const filename = `hype.hk-batch-upload-results-${timestamp}.json`;

  const blob = new Blob([JSON.stringify(downloadData, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Show instruction for CSV conversion
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return CheckCircle;
    case 'error':
      return XCircle;
    case 'processing':
      return ArrowPath;
    case 'unchanged':
      return CheckCircle;
    default:
      return null;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'success':
      return 'text-success';
    case 'error':
      return 'text-error';
    case 'processing':
      return 'text-warning';
    case 'unchanged':
      return 'text-info';
    case 'skipped':
      return 'text-base-content/50';
    default:
      return 'text-base-content/70';
  }
}

async function copyToClipboard(data: any) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    // Could add a toast notification here
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
  }
}
</script>

<div class="space-y-6">
  <!-- Summary Stats -->
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-6">
    <div class="stat rounded-lg bg-base-100 p-4">
      <div class="stat-title text-xs">Pending</div>
      <div class="stat-value text-2xl">{internalStatusCounts.pending}</div>
    </div>
    <div class="stat rounded-lg bg-base-100 p-4">
      <div class="stat-title text-xs">Processing</div>
      <div class="stat-value text-2xl text-warning">
        {internalStatusCounts.processing}
      </div>
    </div>
    <div class="stat rounded-lg bg-base-100 p-4">
      <div class="stat-title text-xs">Success</div>
      <div class="stat-value text-2xl text-success">{internalStatusCounts.success}</div>
    </div>
    <div class="stat rounded-lg bg-base-100 p-4">
      <div class="stat-title text-xs">Unchanged</div>
      <div class="stat-value text-2xl text-info">{internalStatusCounts.unchanged}</div>
    </div>
    <div class="stat rounded-lg bg-base-100 p-4">
      <div class="stat-title text-xs">Errors</div>
      <div class="stat-value text-2xl text-error">{internalStatusCounts.error}</div>
    </div>
    <div class="stat rounded-lg bg-base-100 p-4">
      <div class="stat-title text-xs">Skipped</div>
      <div class="stat-value text-2xl text-base-content/50">
        {internalStatusCounts.skipped}
      </div>
    </div>
  </div>

  <!-- Progress Bar -->
  {#if resolution.isProcessing}
    <div class="space-y-2">
      <div class="flex items-center justify-between text-sm">
        <span>Processing features...</span>
        <span>{resolution.currentIndex + 1} / {resolution.total}</span>
      </div>
      <progress
        class="progress progress-primary w-full"
        value={resolution.currentIndex + 1}
        max={resolution.total}>
      </progress>
    </div>
  {/if}

  <!-- Controls -->
  <div class="flex items-center justify-between">
    <div class="flex gap-2">
      {#if resolution.isProcessing}
        <button class="btn btn-warning" onclick={pauseProcessing}>
          <Icon src={Pause} class="h-4 w-4" />
          Pause Processing
        </button>
      {:else if internalStatusCounts.pending > 0}
        <!-- Start Processing button moved to Footer -->
      {/if}
    </div>

    <div class="flex gap-2">
      {#if internalStatusCounts.success > 0 || internalStatusCounts.error > 0 || internalStatusCounts.skipped > 0 || internalStatusCounts.unchanged > 0}
        <button class="btn btn-outline" onclick={downloadResults}>
          <Icon src={ArrowDownTray} class="h-4 w-4" />
          Download Results
        </button>
      {/if}
    </div>
  </div>

  <!-- Results List -->
  <div class="h-full space-y-2 overflow-y-auto">
    {#each results as result, index (result.rowIndex)}
      <div
        class="flex items-center justify-between rounded-lg border border-base-content/20 bg-base-100/50 p-4"
        transition:fade={{ duration: 200 }}>
        <!-- Status and Info -->
        <div class="flex items-center gap-3">
          {#if getStatusIcon(result.status)}
            <Icon
              src={getStatusIcon(result.status)!}
              class="h-5 w-5 {getStatusColor(result.status)}" />
          {:else}
            <div class="h-5 w-5 rounded-full bg-base-content/20"></div>
          {/if}

          <div>
            <div class="flex flex-row items-center font-medium">
              <code class="pr-2 font-mono text-sm text-base-content/70"
                >{result.rowIndex + 2}
              </code>
              {getFeatureDisplayName(result)}
              {#if result.isNew}
                <span class="badge badge-primary badge-sm ml-2">NEW</span>
              {:else}
                <span
                  class="badge badge-secondary badge-sm ml-2 flex items-center gap-1">
                  UPDATE
                </span>
                {#if result.merged?.id || result.existing?.id}
                  <a
                    href="/admin/features/{result.merged?.id || result.existing?.id}"
                    target="_blank"
                    class="btn btn-ghost btn-sm h-6 min-h-0 w-6 p-0"
                    title="View feature in admin">
                    <Icon src={MapPin} class="h-4 w-4" />
                  </a>
                {/if}
              {/if}
            </div>

            {#if result.error}
              <div class="text-sm text-error">
                {#if result.error.includes('Validation errors:')}
                  <!-- Multi-line validation errors -->
                  <div class="whitespace-pre-line">{result.error}</div>
                {:else}
                  <!-- Single line error -->
                  {result.error}
                {/if}
              </div>
            {:else if result.status === 'success'}
              <div class="text-sm text-success">
                {result.isNew ? 'Created' : 'Updated'} successfully
              </div>
            {:else if result.status === 'unchanged'}
              <div class="text-sm text-info">No changes detected</div>
            {:else if result.status === 'processing'}
              <div class="text-sm text-warning">Processing...</div>
            {:else if result.status === 'skipped'}
              <div class="text-sm text-base-content/50">Skipped by user</div>
            {:else}
              <div class="text-sm text-base-content/70">Ready to process</div>
            {/if}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2">
          <button
            class="btn btn-ghost btn-sm"
            onclick={() => showPreview(index)}
            title="Preview changes">
            <Icon src={Eye} class="h-4 w-4" />
          </button>

          {#if result.status === 'pending'}
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => skipRecord(index)}
              title="Skip this record">
              Skip
            </button>
          {:else if result.status === 'skipped'}
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => includeRecord(index)}
              title="Include this record for processing">
              Include
            </button>
          {:else if result.status === 'error'}
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => retryRecord(index)}
              title="Retry processing">
              Retry
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- Preview Modal -->
{#if resolution.showPreview && currentResult}
  <div class="modal modal-open">
    <div class="modal-box max-w-6xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="flex flex-row text-lg font-bold">
          <code>{currentResult.rowIndex + 2}</code> - {getFeatureDisplayName(
            currentResult
          )}
          {#if currentResult.isNew}
            <span class="badge badge-primary ml-2">NEW FEATURE</span>
          {:else}
            <span class="badge badge-secondary ml-2 flex items-center gap-1">
              UPDATE FEATURE
            </span>
          {/if}
        </h3>
        <div class="flex flex-row items-end justify-end">
          <span class="btn btn-ghost btn-sm">
            {#if currentResult.merged?.id || currentResult.existing?.id}
              <a
                href="/admin/features/{currentResult.merged?.id ||
                  currentResult.existing?.id}"
                target="_blank"
                title="View feature in admin">
                <Icon src={MapPin} class="h-4 w-4" />
              </a>
            {/if}
          </span>
          <button class="btn btn-ghost btn-sm" onclick={hidePreview}>✕</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- Existing Data (Current) - Top Left -->
        {#if !currentResult.isNew && currentResult.existing}
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="font-medium text-warning">Existing Data (Current)</h4>
              <button
                class="btn btn-ghost btn-xs opacity-0 transition-opacity group-hover:opacity-100"
                onclick={() => copyToClipboard(currentResult.existing)}
                title="Copy to clipboard">
                <Icon src={ClipboardDocument} class="h-4 w-4" />
              </button>
            </div>
            <div
              class="group relative max-h-96 overflow-y-auto rounded-lg border border-warning/20 bg-warning/5 p-4">
              <pre class="text-xs">{JSON.stringify(
                  currentResult.existing,
                  null,
                  2
                )}</pre>
            </div>
          </div>
        {:else if currentResult.isNew}
          <div class="space-y-4">
            <h4 class="font-medium text-base-content/70">New Feature</h4>
            <div
              class="flex h-32 items-center justify-center rounded-lg bg-base-200 p-4">
              <span class="text-base-content/50"
                >No existing data - this will create a new feature</span>
            </div>
          </div>
        {:else}
          <!-- Update with no existing data (error case) -->
          <div class="space-y-4">
            <h4 class="font-medium text-error">Missing Existing Data</h4>
            <div
              class="flex h-32 items-center justify-center rounded-lg border border-error/20 bg-error/5 p-4">
              <span class="text-center text-error"
                >This is marked as an update but no existing data was found. The feature
                may have been deleted or there was an error fetching it.</span>
            </div>
          </div>
        {/if}

        <!-- Merged Data (To Be Saved) - Top Right -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="font-medium text-primary">Merged Data (To Be Saved)</h4>
            <div class="flex items-center gap-2">
              {#if !currentResult.isNew && currentResult.existing}
                <label class="label cursor-pointer gap-2">
                  <span class="label-text text-xs">Hide unchanged</span>
                  <input
                    type="checkbox"
                    class="toggle toggle-xs"
                    bind:checked={hideUnchanged} />
                </label>
              {/if}
              <button
                class="btn btn-ghost btn-xs opacity-0 transition-opacity group-hover:opacity-100"
                onclick={() => copyToClipboard(currentResult.merged)}
                title="Copy to clipboard">
                <Icon src={ClipboardDocument} class="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            class="group relative max-h-96 overflow-y-auto rounded-lg border border-primary/20 bg-primary/5 p-4">
            {#if !currentResult.isNew && currentResult.existing}
              {@html renderDiffView(
                currentResult.existing,
                currentResult.merged,
                hideUnchanged
              )}
            {:else}
              <pre class="text-xs">{JSON.stringify(currentResult.merged, null, 2)}</pre>
            {/if}
          </div>
        </div>
      </div>

      <!-- Data Sources -->
      <div class="mt-6 space-y-4">
        <h4 class="font-medium">Data Sources</h4>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <!-- Submitted Data -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h5 class="text-sm font-medium text-base-content/70">CSV Data</h5>
              <button
                class="btn btn-ghost btn-xs opacity-0 transition-opacity group-hover:opacity-100"
                onclick={() => copyToClipboard(currentResult.submitted)}
                title="Copy to clipboard">
                <Icon src={ClipboardDocument} class="h-3 w-3" />
              </button>
            </div>
            <div
              class="group relative max-h-48 overflow-y-auto rounded bg-base-100 p-3">
              <pre class="text-xs">{JSON.stringify(
                  currentResult.submitted,
                  null,
                  2
                )}</pre>
            </div>
          </div>

          <!-- Enriched Data -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h5 class="text-sm font-medium text-base-content/70">Enriched Data</h5>
              <button
                class="btn btn-ghost btn-xs opacity-0 transition-opacity group-hover:opacity-100"
                onclick={() => copyToClipboard(currentResult.enriched)}
                title="Copy to clipboard">
                <Icon src={ClipboardDocument} class="h-3 w-3" />
              </button>
            </div>
            <div
              class="group relative max-h-48 overflow-y-auto rounded bg-base-100 p-3">
              <pre class="text-xs">{JSON.stringify(
                  currentResult.enriched,
                  null,
                  2
                )}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Error Display -->
      {#if currentResult.error}
        <div class="mt-6 space-y-2">
          <h4 class="font-medium text-error">Validation Errors</h4>
          <div class="rounded-lg border border-error/20 bg-error/5 p-4">
            {#if currentResult.error.includes('Validation errors:')}
              <!-- Multi-line validation errors with better formatting -->
              <div class="whitespace-pre-line font-mono text-sm text-error">
                {currentResult.error}
              </div>
            {:else}
              <!-- Single line error -->
              <div class="text-sm text-error">{currentResult.error}</div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="modal-action">
        {#if currentResult.status === 'pending'}
          <button
            class="btn btn-ghost"
            onclick={() => skipRecord(resolution.previewIndex)}>
            Skip This Record
          </button>
          <button
            class="btn btn-primary"
            onclick={async () => {
              const updatedResult = await processFeatureResolution(
                currentResult,
                importCtx
              );
              importCtx.updateFeatureResolutionResult(
                resolution.previewIndex,
                updatedResult
              );
            }}>
            Accept & Process
          </button>
        {:else if currentResult.status === 'skipped'}
          <button
            class="btn btn-primary"
            onclick={() => includeRecord(resolution.previewIndex)}>
            Include This Record
          </button>
          <button class="btn btn-ghost" onclick={hidePreview}>Close</button>
        {:else}
          <button class="btn btn-primary" onclick={hidePreview}>Close</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
