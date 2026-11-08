<script lang="ts">
// COMPONENTS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
import ArrowDownTray from 'virtual:icons/proicons/arrow-download'
// I18N
import { m } from '#lib/i18n.js'
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
        class="border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 focus:ring-primary/30 rounded-full border p-6 transition-colors focus:ring-2 focus:outline-none"
        onclick={downloadResultsAction}
        aria-label={m.feature_import__finished_download_title()}
        data-tooltip={m.feature_import__finished_download_title()}
      >
        <Icon src={ArrowDownTray} class="h-12 w-12" />
      </button>
    {:else}
      <div class="border-primary/20 bg-primary/10 text-primary rounded-full border p-6">
        <Icon src={ArrowDownTray} class="h-12 w-12" />
      </div>
    {/if}
    <div class="space-y-2">
      <h3 class="text-2xl font-semibold">{m.feature_import__finished_title()}</h3>
      <p class="text-base-content/70 text-sm">
        {m.feature_import__finished_description()}
      </p>
    </div>
  </div>
</ImportCanvas>
