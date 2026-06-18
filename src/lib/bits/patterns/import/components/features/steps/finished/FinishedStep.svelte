<script lang="ts">
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ArrowDownTray from 'virtual:icons/lucide/download'
// I18N
import { m } from '$lib/i18n'
// PATTERN COMPONENTS
import ImportCanvas from '../../../shared/ImportCanvas.svelte'

type Props = {
  canDownloadResults: boolean
  downloadResultsAction?: () => void
}

let { canDownloadResults, downloadResultsAction }: Props = $props()
</script>

<ImportCanvas class="flex h-full min-h-[28rem] items-center justify-center">
  <div class="flex max-w-md flex-col items-center gap-5 text-center">
    {#if canDownloadResults && downloadResultsAction}
      <button
        type="button"
        class="rounded-full border border-primary/20 bg-primary/10 p-6 text-primary transition-colors hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/30"
        onclick={downloadResultsAction}
        title={m.feature_import__finished_download_title()}
      >
        <Icon src={ArrowDownTray} class="h-12 w-12" />
      </button>
    {:else}
      <div class="rounded-full border border-primary/20 bg-primary/10 p-6 text-primary">
        <Icon src={ArrowDownTray} class="h-12 w-12" />
      </div>
    {/if}
    <div class="space-y-2">
      <h3 class="text-2xl font-semibold">{m.feature_import__finished_title()}</h3>
      <p class="text-sm text-base-content/70">
        {m.feature_import__finished_description()}
      </p>
    </div>
  </div>
</ImportCanvas>
