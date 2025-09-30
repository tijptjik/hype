<script lang="ts">
// SVELTE
import { scale } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { CheckCircle, XCircle, Photo } from '@steeze-ui/heroicons';

// TYPES
import type { BatchUploadResult } from '$lib/types';

type Props = {
  result: BatchUploadResult;
  index: number;
};

let { result, index }: Props = $props();
</script>

<div
  class="flex items-center justify-between rounded-lg border border-primary bg-glass-result p-4"
  in:scale={{ duration: 200, delay: index * 50 }}>
  <div class="flex items-center space-x-3">
    <!-- Status Icon -->
    {#if result.status === 'success'}
      <Icon src={CheckCircle} class="h-5 w-5 text-glass-accepted" />
    {:else if result.status === 'error'}
      <Icon src={XCircle} class="h-5 w-5 text-glass-rejected" />
    {:else if result.status === 'uploading'}
      <span class="loading loading-ring loading-sm text-warning"></span>
    {:else}
      <Icon src={Photo} class="h-5 w-5 text-base-content/50" />
    {/if}

    <!-- File Info -->
    <div>
      <div class="font-medium">{result.file.name}</div>
      <div class="text-sm text-base-content/70">
        {m.batch_upload__feature_id()}: {result.featureId || 'Not found'}
      </div>
      {#if result.error}
        <div class="text-sm text-error">{result.error}</div>
      {/if}
    </div>
  </div>

  <!-- Status Badge -->
  <div
    class="badge {result.status === 'success'
      ? 'badge-success'
      : result.status === 'error'
        ? 'badge-error'
        : result.status === 'uploading'
          ? 'badge-warning'
          : 'badge-ghost'}">
    {result.status}
  </div>
</div>
