<script lang="ts">
// SVELTE
import { scale } from 'svelte/transition'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import { Badge } from '#lib/bits/custom/index.js'
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import CheckCircle from 'virtual:icons/proicons/checkmark-circle'
import CircleAlert from 'virtual:icons/proicons/alert-circle'
import CopyX from 'virtual:icons/lucide/copy-x'
import Photo from 'virtual:icons/proicons/photo'
import Replace from 'virtual:icons/proicons/arrow-swap'
// PATTERN COMPONENTS
import ImportRow from '../shared/ImportRow.svelte'
import ImportImagePreview from './ImportImagePreview.svelte'
// SERVICES
import {
  formatImportFileSize,
  getUploadStatusBadgeText,
  getUploadStatusBadgeTone,
} from '#lib/client/services/import/shared.js'
// TYPES
import type { BatchUploadResult } from '#lib/client/services/import/types.js'

type Props = {
  result: BatchUploadResult
  index: number
  onReplace?: (resultId: string) => void
  replaceDisabled?: boolean
}

let { result, index, onReplace, replaceDisabled = false }: Props = $props()

let shouldShowError = $derived(Boolean(result.error && result.status !== 'uploading'))
</script>

{#snippet preview()}
  <ImportImagePreview file={result.file} alt={result.file.name} />
{/snippet}

<div in:scale={{ duration: 200, delay: index * 50 }}>
  <ImportRow
    leading={preview}
    contentClass="flex min-w-0 items-start justify-between gap-4"
  >
    <div class="flex min-w-0 items-start gap-3">
      <div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {#if result.status === 'success'}
          <Icon src={CheckCircle} class="text-success h-5 w-5" />
        {:else if result.status === 'conflict'}
          <Icon src={CopyX} class="text-warning h-5 w-5" />
        {:else if result.status === 'error'}
          <Icon src={CircleAlert} class="text-error h-5 w-5" />
        {:else if result.status === 'uploading'}
          <span class="loading loading-ring loading-sm text-warning"></span>
        {:else}
          <Icon src={Photo} class="text-base-content/50 h-5 w-5" />
        {/if}
      </div>

      <div class="min-w-0 space-y-1">
        <div class="overflow-hidden font-medium text-ellipsis whitespace-nowrap">
          {result.file.name}
        </div>
        <div
          class="text-base-content/50 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tracking-[0.16em] uppercase"
        >
          <span>{formatImportFileSize(result.file.size)}</span>
          <span>{result.file.type || 'unknown format'}</span>
        </div>
        {#if shouldShowError}
          <div
            class={result.status === 'conflict'
              ? 'text-warning text-sm'
              : 'text-error text-sm'}
          >
            {result.error}
          </div>
        {:else}
          <div class="text-base-content/70 text-sm">
            {m.batch_upload__feature_id()}:
            {#if result.featureId}
              <a
                href={`/admin/features/${result.featureId}`}
                target="_blank"
                rel="noreferrer"
                class="hover:underline"
              >
                <code class="text-foreground">{result.featureId}</code>
              </a>
            {:else}
              <code class="text-foreground">{m.batch_upload__feature_not_found()}</code>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="mt-2 mr-2 flex shrink-0 items-start gap-3">
      {#if result.status === 'conflict' && onReplace}
        <Button
          text={m.replace()}
          size="sm"
          style="outline"
          iconComponent={Replace}
          disabled={replaceDisabled}
          onClick={() => onReplace(result.id)}
        />
      {:else}
        <Badge
          text={getUploadStatusBadgeText(result.status)}
          tone={getUploadStatusBadgeTone(result.status)}
        />
      {/if}
    </div>
  </ImportRow>
</div>
