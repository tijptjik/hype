<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Badge } from '#lib/bits/custom/badge/index.js'
// COMPONENTS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import CheckCircle from 'virtual:icons/proicons/checkmark-circle'
import XCircle from 'virtual:icons/proicons/cancel-circle'
import ArrowPath from 'virtual:icons/proicons/arrow-sync'
import FileDiff from 'virtual:icons/proicons/diff'
import MapPin from 'virtual:icons/proicons/location'
import FeatureResolutionPreview from './FeatureResolutionPreview.svelte'
// SERVICES
import {
  getFeatureResolutionDisplayName,
  isFeatureResolutionCreateResult,
  type FeatureResolutionData,
} from '#lib/client/services/import/features/resolution.js'
// TYPES
import type { Component } from 'svelte'

type Props = {
  result: FeatureResolutionData
  index: number
  showPreview: boolean
  hideUnchanged: boolean
  copiedKey: string | null
  onShowPreview: (index: number) => void
  onSkip: (index: number) => void
  onInclude: (index: number) => void
  onRetry: (index: number) => void
  onHideUnchangedChange: (checked: boolean) => void
  onCopy: (data: unknown, key: string) => void
}

let {
  result,
  index,
  showPreview,
  hideUnchanged,
  copiedKey,
  onShowPreview,
  onSkip,
  onInclude,
  onRetry,
  onHideUnchangedChange,
  onCopy,
}: Props = $props()

const statusIcon = $derived(getStatusIcon(result.status))
const isCreateResult = $derived(isFeatureResolutionCreateResult(result))
const isIgnoredResult = $derived(result.status === 'skipped')
const currentFeatureId = $derived(result.existing?.id ?? null)

function getStatusIcon(
  status: FeatureResolutionData['status'],
): Component<Record<string, unknown>> | null {
  switch (status) {
    case 'success':
    case 'unchanged':
      return CheckCircle
    case 'error':
      return XCircle
    case 'processing':
      return ArrowPath
    default:
      return null
  }
}

function getStatusColor(status: FeatureResolutionData['status']): string {
  switch (status) {
    case 'success':
      return 'text-success'
    case 'error':
      return 'text-error'
    case 'processing':
      return 'text-warning'
    case 'unchanged':
      return 'text-info'
    case 'skipped':
      return 'text-base-content/50'
    default:
      return 'text-base-content/70'
  }
}
</script>

<div
  data-feature-resolution-row={index}
  class="border-base-content/15 bg-panel/[0.28] hover:border-base-content/25 hover:bg-panel/[0.36] relative rounded-2xl border p-4 shadow-[var(--shadow-mini)] transition-colors"
  transition:fade={{ duration: 200 }}
>
  <button
    type="button"
    class="focus-visible:ring-primary/60 absolute inset-0 z-0 cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2"
    onclick={() => onShowPreview(index)}
    aria-label={m.feature_import__resolution_inspect_row({ row: index + 1 })}
  ></button>

  <div
    class="pointer-events-none relative z-10 grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]"
  >
    <div class="flex items-start gap-3">
      {#if statusIcon}
        <Icon src={statusIcon} class="h-5 w-5 {getStatusColor(result.status)}" />
      {:else}
        <div class="bg-base-content/20 h-5 w-5 rounded-full"></div>
      {/if}

      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2 font-medium">
          <code class="text-base-content/70 font-mono text-sm">{index + 1}</code>
          <span class="overflow-hidden text-ellipsis whitespace-nowrap"
            >{getFeatureResolutionDisplayName(result)}</span
          >
          {#if isIgnoredResult}
            <Badge
              text="IGNORE"
              tone="neutral"
              class="border-base-content/20 bg-base-content/8 text-base-content/55 font-mono"
            />
          {:else if isCreateResult}
            <Badge
              text="NEW"
              tone="success"
              class="border-success/35 bg-success/12 text-success font-mono"
            />
          {:else}
            <Badge
              text="UPDATE"
              tone="neutral"
              class="border-info/30 bg-info/12 text-info font-mono"
            />
          {/if}
        </div>

        <div class="mt-1 flex flex-wrap items-center gap-2">
          {#if result.status === 'skipped'}
            <div class="text-base-content/50 text-sm">
              {m.feature_import__resolution_skipped()}
            </div>
          {:else if result.error}
            <div class="text-error text-sm">
              {#if result.error.includes('Validation errors:')}
                <div class="whitespace-pre-line">{result.error}</div>
              {:else}
                {result.error}
              {/if}
            </div>
          {:else if result.status === 'success'}
            <div class="text-success text-sm">
              {isCreateResult
                ? m.feature_import__resolution_created()
                : m.feature_import__resolution_updated()}
            </div>
          {:else if result.status === 'unchanged'}
            <div class="text-info text-sm">
              {m.feature_import__resolution_no_changes()}
            </div>
          {:else if result.status === 'processing'}
            <div class="text-warning text-sm">
              {m.feature_import__resolution_processing()}
            </div>
          {:else}
            <div class="text-base-content/70 text-sm">
              {m.feature_import__resolution_ready()}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="pointer-events-auto flex items-center justify-end">
      <div
        class="border-base-content/10 bg-base-content/[0.04] inline-flex overflow-hidden rounded-full border"
      >
        <button
          type="button"
          class={`hover:bg-base-content/10 inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors ${showPreview ? 'bg-base-content/10 text-primary' : 'text-base-content/75'}`}
          onclick={event => {
            event.stopPropagation()
            onShowPreview(index)
          }}
          data-tooltip={m.feature_import__resolution_inspect_title()}
        >
          <Icon src={FileDiff} class="h-4 w-4" />
          {m.feature_import__resolution_inspect()}
        </button>

        {#if currentFeatureId}
          <a
            href="/admin/features/{currentFeatureId}"
            target="_blank"
            rel="noreferrer"
            class="border-base-content/10 text-base-content/75 hover:bg-base-content/10 hover:text-primary inline-flex items-center gap-2 border-l px-3 py-2 text-sm transition-colors"
            data-tooltip={m.feature_import__resolution_see_current_title()}
            onclick={event => event.stopPropagation()}
          >
            <Icon src={MapPin} class="h-4 w-4" />
            {m.feature_import__resolution_see_current()}
          </a>
        {:else}
          <span
            class="border-base-content/10 text-base-content/30 inline-flex cursor-default items-center gap-2 border-l px-3 py-2 text-sm"
            data-tooltip={m.feature_import__resolution_no_current_title()}
          >
            <Icon src={MapPin} class="h-4 w-4" />
            {m.feature_import__resolution_see_current()}
          </span>
        {/if}
      </div>
    </div>

    <div class="pointer-events-auto flex items-center justify-end gap-2">
      {#if result.status === 'pending'}
        <button
          type="button"
          class="btn btn-outline btn-sm min-w-24"
          onclick={event => {
            event.stopPropagation()
            onSkip(index)
          }}
          data-tooltip={m.feature_import__resolution_skip_title()}
        >
          {m.skip()}
        </button>
      {:else if result.status === 'skipped'}
        <button
          type="button"
          class="btn btn-outline btn-sm border-success/30 text-success hover:bg-success/10 min-w-24"
          onclick={event => {
            event.stopPropagation()
            onInclude(index)
          }}
          data-tooltip={m.feature_import__resolution_include_title()}
        >
          {m.feature_import__resolution_include()}
        </button>
      {:else if result.status === 'error'}
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onclick={event => {
            event.stopPropagation()
            onRetry(index)
          }}
          data-tooltip={m.feature_import__resolution_retry_title()}
        >
          {m.retry()}
        </button>
      {/if}
    </div>
  </div>

  {#if showPreview}
    <FeatureResolutionPreview
      {result}
      {index}
      {hideUnchanged}
      {copiedKey}
      {onHideUnchangedChange}
      {onCopy}
    />
  {/if}
</div>
