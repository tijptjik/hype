<script lang="ts">
// ICONS
import CheckIcon from 'virtual:icons/lucide/check'
// TYPES
import type { Snippet } from 'svelte'

let {
  label,
  description,
  selected,
  onclick,
  icon,
}: {
  label: string
  description?: string
  selected: boolean
  onclick: () => void
  icon: Snippet
} = $props()
</script>

<button
  type="button"
  aria-pressed={selected}
  class="border-border bg-card hover:border-primary/60 hover:bg-primary/5 aria-pressed:border-primary aria-pressed:bg-primary/10 focus-visible:outline-primary flex h-full min-w-0 cursor-pointer flex-col gap-3 rounded-xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
  {onclick}
>
  <span class="flex w-full items-start justify-between gap-3" aria-hidden="true">
    <span
      class="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-lg"
    >
      {@render icon()}
    </span>
    <span class="text-primary flex size-6 items-center justify-center">
      {#if selected}
        <CheckIcon class="size-5" />
      {/if}
    </span>
  </span>
  <span class="min-w-0 break-words whitespace-normal">
    <span class="block font-semibold">{label}</span>
    {#if description}
      <span class="text-muted-foreground mt-1 block text-sm leading-relaxed"
        >{description}</span
      >
    {/if}
  </span>
</button>
