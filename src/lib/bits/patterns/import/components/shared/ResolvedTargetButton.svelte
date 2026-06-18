<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
import CheckCircle from 'virtual:icons/lucide/circle-check'

type Props = {
  children: Snippet
  title: string
  changeLabel: string
  onReset: () => void
}

let { children, title, changeLabel, onReset }: Props = $props()
</script>

<button
  type="button"
  class="flex w-full items-center justify-between rounded p-3 text-left transition-colors focus:outline-none"
  onclick={onReset}
  {title}
>
  <div class="flex min-w-0 items-center gap-3">
    {@render children()}
  </div>
  <div class="flex shrink-0 items-center gap-2 text-xs text-success/70">
    <Icon src={CheckCircle} class="h-4 w-4" />
    <span>{changeLabel}</span>
  </div>
</button>
