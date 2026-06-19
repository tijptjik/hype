<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// BITS COMPONENTS
import { Badge } from '$lib/bits/custom/badge'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import CheckCircle from 'virtual:icons/lucide/circle-check'
import XCircle from 'virtual:icons/lucide/circle-x'
import ArrowPath from 'virtual:icons/lucide/refresh-cw'
import FileDiff from 'virtual:icons/lucide/file-diff'
import MapPin from 'virtual:icons/lucide/map-pin'
import FeatureResolutionPreview from './FeatureResolutionPreview.svelte'
// SERVICES
import {
  getFeatureResolutionDisplayName,
  isFeatureResolutionCreateResult,
  type FeatureResolutionData,
} from '$lib/client/services/import/features/resolution'
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
  class="relative rounded-2xl border border-base-content/15 bg-black/[0.28] p-4 shadow-[var(--shadow-mini)] transition-colors hover:border-base-content/25 hover:bg-black/[0.36]"
  transition:fade={{ duration: 200 }}
>
  <button
    type="button"
    class="absolute inset-0 z-0 cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
        <div class="h-5 w-5 rounded-full bg-base-content/20"></div>
      {/if}

      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2 font-medium">
          <code class="font-mono text-sm text-base-content/70">{index + 1}</code>
          <span class="truncate">{getFeatureResolutionDisplayName(result)}</span>
          {#if isIgnoredResult}
            <Badge
              text="IGNORE"
              tone="neutral"
              class="border-base-content/20 bg-base-content/8 font-mono text-base-content/55"
            />
          {:else if isCreateResult}
            <Badge
              text="NEW"
              tone="success"
              class="border-success/35 bg-success/12 font-mono text-success"
            />
          {:else}
            <Badge
              text="UPDATE"
              tone="neutral"
              class="border-info/30 bg-info/12 font-mono text-info"
            />
          {/if}
        </div>

        <div class="mt-1 flex flex-wrap items-center gap-2">
          {#if result.status === 'skipped'}
            <div class="text-sm text-base-content/50">
              {m.feature_import__resolution_skipped()}
            </div>
          {:else if result.error}
            <div class="text-sm text-error">
              {#if result.error.includes('Validation errors:')}
                <div class="whitespace-pre-line">{result.error}</div>
              {:else}
                {result.error}
              {/if}
            </div>
          {:else if result.status === 'success'}
            <div class="text-sm text-success">
              {isCreateResult
                ? m.feature_import__resolution_created()
                : m.feature_import__resolution_updated()}
            </div>
          {:else if result.status === 'unchanged'}
            <div class="text-sm text-info">
              {m.feature_import__resolution_no_changes()}
            </div>
          {:else if result.status === 'processing'}
            <div class="text-sm text-warning">
              {m.feature_import__resolution_processing()}
            </div>
          {:else}
            <div class="text-sm text-base-content/70">
              {m.feature_import__resolution_ready()}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="pointer-events-auto flex items-center justify-end">
      <div
        class="inline-flex overflow-hidden rounded-full border border-base-content/10 bg-base-content/[0.04]"
      >
        <button
          type="button"
          class={`inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-base-content/10 ${showPreview ? 'bg-base-content/10 text-primary' : 'text-base-content/75'}`}
          onclick={event => {
            event.stopPropagation()
            onShowPreview(index)
          }}
          title={m.feature_import__resolution_inspect_title()}
        >
          <Icon src={FileDiff} class="h-4 w-4" />
          {m.feature_import__resolution_inspect()}
        </button>

        {#if currentFeatureId}
          <a
            href="/admin/features/{currentFeatureId}"
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center gap-2 border-l border-base-content/10 px-3 py-2 text-sm text-base-content/75 transition-colors hover:bg-base-content/10 hover:text-primary"
            title={m.feature_import__resolution_see_current_title()}
            onclick={event => event.stopPropagation()}
          >
            <Icon src={MapPin} class="h-4 w-4" />
            {m.feature_import__resolution_see_current()}
          </a>
        {:else}
          <span
            class="inline-flex cursor-not-allowed items-center gap-2 border-l border-base-content/10 px-3 py-2 text-sm text-base-content/30"
            title={m.feature_import__resolution_no_current_title()}
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
          title={m.feature_import__resolution_skip_title()}
        >
          {m.skip()}
        </button>
      {:else if result.status === 'skipped'}
        <button
          type="button"
          class="btn btn-outline btn-sm min-w-24 border-success/30 text-success hover:bg-success/10"
          onclick={event => {
            event.stopPropagation()
            onInclude(index)
          }}
          title={m.feature_import__resolution_include_title()}
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
          title={m.feature_import__resolution_retry_title()}
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
