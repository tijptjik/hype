<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// BITS COMPONENTS
import { SimpleTooltip } from '$lib/bits/core/tooltip'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import CheckCircle from 'virtual:icons/lucide/circle-check'
import ClipboardDocument from 'virtual:icons/lucide/clipboard'
import ChevronsDownUp from 'virtual:icons/lucide/chevrons-down-up'
import ChevronsUpDown from 'virtual:icons/lucide/chevrons-up-down'
// SERVICES
import {
  isFeatureResolutionCreateResult,
  renderFeatureResolutionDiff,
  toFeatureResolutionPreview,
  type FeatureResolutionData,
} from '$lib/client/services/import/features/resolution'

type Props = {
  result: FeatureResolutionData
  index: number
  hideUnchanged: boolean
  copiedKey: string | null
  onHideUnchangedChange: (checked: boolean) => void
  onCopy: (data: unknown, key: string) => void
}

let { result, index, hideUnchanged, copiedKey, onHideUnchangedChange, onCopy }: Props =
  $props()

const previewExisting = $derived(
  !isFeatureResolutionCreateResult(result) && result.existing
    ? toFeatureResolutionPreview(result.existing)
    : null,
)
const previewMerged = $derived(toFeatureResolutionPreview(result.merged))
</script>

<div
  class="pointer-events-auto relative z-10 mt-4 border-t border-base-content/10 pt-4"
  transition:fade={{ duration: 180 }}
>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    {#if previewExisting}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h4 class="font-medium text-warning">
            {m.feature_import__resolution_existing_data()}
          </h4>
          <button
            type="button"
            class="inline-flex h-6 w-6 items-center justify-center rounded text-base-content/55 transition-colors hover:bg-base-content/10 hover:text-primary"
            onclick={() => onCopy(previewExisting, `existing-${index}`)}
            title={m.feature_import__resolution_copy_title()}
          >
            <Icon
              src={copiedKey === `existing-${index}` ? CheckCircle : ClipboardDocument}
              class="h-4 w-4"
            />
          </button>
        </div>
        <div
          class="max-h-96 overflow-y-auto rounded-lg border border-warning/20 bg-warning/5 p-4"
        >
          <pre class="text-xs">{JSON.stringify(previewExisting, null, 2)}</pre>
        </div>
      </div>
    {:else}
      <div class="space-y-4">
        <h4 class="font-medium text-base-content/70">
          {m.feature_import__resolution_new_feature()}
        </h4>
        <div class="flex h-32 items-center justify-center rounded-lg bg-base-200 p-4">
          <span class="text-base-content/50">
            {#if result.hasProvidedIdWithoutMatch}
              {m.feature_import__resolution_no_existing_supplied_id()}
            {:else}
              {m.feature_import__resolution_no_existing_new()}
            {/if}
          </span>
        </div>
      </div>
    {/if}

    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-medium text-primary">
          {m.feature_import__resolution_merged_data()}
        </h4>
        <div class="flex items-center gap-2">
          {#if previewExisting}
            <SimpleTooltip triggerClass="inline-flex h-6 w-6">
              {#snippet trigger()}
                <button
                  type="button"
                  class={`inline-flex h-6 w-6 items-center justify-center rounded text-base-content/55 transition-colors hover:bg-base-content/10 hover:text-primary ${hideUnchanged ? 'bg-base-content/10 text-primary' : ''}`}
                  aria-pressed={hideUnchanged}
                  aria-label={m.feature_import__resolution_hide_unchanged()}
                  onclick={() => onHideUnchangedChange(!hideUnchanged)}
                >
                  <Icon
                    src={hideUnchanged ? ChevronsDownUp : ChevronsUpDown}
                    class="h-4 w-4"
                  />
                </button>
              {/snippet}
              <span>{m.feature_import__resolution_hide_unchanged()}</span>
            </SimpleTooltip>
          {/if}
          <button
            type="button"
            class="inline-flex h-6 w-6 items-center justify-center rounded text-base-content/55 transition-colors hover:bg-base-content/10 hover:text-primary"
            onclick={() => onCopy(previewMerged, `merged-${index}`)}
            title={m.feature_import__resolution_copy_title()}
          >
            <Icon
              src={copiedKey === `merged-${index}` ? CheckCircle : ClipboardDocument}
              class="h-4 w-4"
            />
          </button>
        </div>
      </div>
      <div
        class="max-h-96 overflow-y-auto rounded-lg border border-primary/20 bg-primary/5 p-4"
      >
        {#if previewExisting && previewMerged}
          {@html renderFeatureResolutionDiff(
            previewExisting as Record<string, unknown>,
            previewMerged as Record<string, unknown>,
            hideUnchanged,
          )}
        {:else}
          <pre class="text-xs">{JSON.stringify(previewMerged, null, 2)}</pre>
        {/if}
      </div>
    </div>
  </div>

  <div class="mt-6 space-y-4">
    <h4 class="font-medium">{m.feature_import__resolution_data_sources()}</h4>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h5 class="text-sm font-medium text-base-content/70">
            {m.feature_import__resolution_csv_data()}
          </h5>
          <button
            type="button"
            class="inline-flex h-6 w-6 items-center justify-center rounded text-base-content/55 transition-colors hover:bg-base-content/10 hover:text-primary"
            onclick={() => onCopy(result.submitted, `submitted-${index}`)}
            title={m.feature_import__resolution_copy_title()}
          >
            <Icon
              src={copiedKey === `submitted-${index}` ? CheckCircle : ClipboardDocument}
              class="h-4 w-4"
            />
          </button>
        </div>
        <div class="max-h-48 overflow-y-auto rounded bg-base-100 p-3">
          <pre class="text-xs">{JSON.stringify(result.submitted, null, 2)}</pre>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h5 class="text-sm font-medium text-base-content/70">
            {m.feature_import__resolution_enriched_data()}
          </h5>
          <button
            type="button"
            class="inline-flex h-6 w-6 items-center justify-center rounded text-base-content/55 transition-colors hover:bg-base-content/10 hover:text-primary"
            onclick={() => onCopy(result.enriched, `enriched-${index}`)}
            title={m.feature_import__resolution_copy_title()}
          >
            <Icon
              src={copiedKey === `enriched-${index}` ? CheckCircle : ClipboardDocument}
              class="h-4 w-4"
            />
          </button>
        </div>
        <div class="max-h-48 overflow-y-auto rounded bg-base-100 p-3">
          <pre class="text-xs">{JSON.stringify(result.enriched, null, 2)}</pre>
        </div>
      </div>
    </div>
  </div>

  {#if result.error}
    <div class="mt-6 space-y-2">
      <h4 class="font-medium text-error">
        {m.feature_import__resolution_validation_errors()}
      </h4>
      <div class="rounded-lg border border-error/20 bg-error/5 p-4">
        {#if result.error.includes('Validation errors:')}
          <div class="whitespace-pre-line font-mono text-sm text-error">
            {result.error}
          </div>
        {:else}
          <div class="text-sm text-error">{result.error}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>
