<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import ImportRow from './ImportRow.svelte'
import ArrowRight from 'virtual:icons/lucide/arrow-right'

type Props = {
  children?: Snippet
  source: Snippet
  target: Snippet
  actionLabel: string
  class?: string
}

let { source, target, actionLabel, class: className = '' }: Props = $props()
</script>

<ImportRow class={className} contentClass="p-0">
  <div
    class="grid min-h-20 grid-cols-1 items-stretch overflow-visible md:grid-cols-[minmax(0,1fr)_9.5rem_minmax(0,1fr)]"
  >
    <div class="flex min-w-0 items-center px-4 py-3">{@render source()}</div>

    <div
      class="flex items-center justify-center bg-base-300/70 px-4 mr-4 py-3 text-xs font-bold uppercase tracking-wide text-base-content/70"
      style="clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)"
    >
      {actionLabel}
    </div>

    <div class="flex min-w-0 items-center px-4 py-3">{@render target()}</div>
  </div>
</ImportRow>
