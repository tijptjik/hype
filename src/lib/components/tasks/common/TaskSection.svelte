<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  title?: string
  borderColor?: string
  children: Snippet
}

const { title, borderColor = '#cc50a98c', children }: Props = $props()
</script>

<div
  class="flex h-full flex-col overflow-hidden rounded-xl border-3 bg-glass-300 shadow-xl"
  style="border-color: {borderColor}"
>
  {#if title}
    <h3 class="text-md mb-4 pt-4 text-center font-medium uppercase text-base-content">
      {title}
    </h3>
  {/if}
  <div class="bg-grain flex flex-1 flex-col gap-4 rounded-b-xl p-6 pt-4">
    {@render children()}
  </div>
</div>
