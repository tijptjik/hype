<script lang="ts">
// SVELTE
import { scale } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
import { Badge } from '$lib/bits/custom'
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import CheckCircle from 'virtual:icons/lucide/circle-check'
import CircleAlert from 'virtual:icons/lucide/circle-alert'
import CopyX from 'virtual:icons/lucide/copy-x'
import Photo from 'virtual:icons/lucide/image'
import Replace from 'virtual:icons/lucide/replace'
// PATTERN COMPONENTS
import ImportRow from '../shared/ImportRow.svelte'
import ImportImagePreview from './ImportImagePreview.svelte'
// SERVICES
import {
  formatImportFileSize,
  getUploadStatusBadgeText,
  getUploadStatusBadgeTone,
} from '$lib/client/services/import/shared'
// TYPES
import type { BatchUploadResult } from '$lib/client/services/import/types'

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
          <Icon src={CheckCircle} class="h-5 w-5 text-success" />
        {:else if result.status === 'conflict'}
          <Icon src={CopyX} class="h-5 w-5 text-warning" />
        {:else if result.status === 'error'}
          <Icon src={CircleAlert} class="h-5 w-5 text-error" />
        {:else if result.status === 'uploading'}
          <span class="loading loading-ring loading-sm text-warning"></span>
        {:else}
          <Icon src={Photo} class="h-5 w-5 text-base-content/50" />
        {/if}
      </div>

      <div class="min-w-0 space-y-1">
        <div class="truncate font-medium">{result.file.name}</div>
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.16em] text-base-content/50"
        >
          <span>{formatImportFileSize(result.file.size)}</span>
          <span>{result.file.type || 'unknown format'}</span>
        </div>
        {#if shouldShowError}
          <div
            class={result.status === 'conflict' ? 'text-sm text-warning' : 'text-sm text-error'}
          >
            {result.error}
          </div>
        {:else}
          <div class="text-sm text-base-content/70">
            {m.batch_upload__feature_id()}:
            {#if result.featureId}
              <a
                href={`/admin/features/${result.featureId}`}
                target="_blank"
                rel="noreferrer"
                class="hover:underline"
              >
                <code class="text-white">{result.featureId}</code>
              </a>
            {:else}
              <code class="text-white">{m.batch_upload__feature_not_found()}</code>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="mr-2 mt-2 flex shrink-0 items-start gap-3">
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
