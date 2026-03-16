<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// TYPES
import type { PanelProps } from '$lib/types'

let {
  isOpen,
  children,
  collapsedContent = undefined,
  ...panelProps
}: {
  isOpen: boolean
  children?: any
  collapsedContent?: any
} & PanelProps = $props()
</script>

{#if isOpen && children}
  <div
    class="flex min-h-0 grow flex-col overflow-hidden bg-black caret-white"
    transition:slide={{ duration: 200 }}
  >
    {@render children()}
  </div>
{:else if collapsedContent}
  <div class="flex shrink-0 flex-col overflow-visible">
    {@render collapsedContent()}
  </div>
{/if}
