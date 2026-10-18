<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
import { slide } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

type Props = {
  isOpen: boolean
  children?: Snippet
  collapsedContent?: Snippet
  managedContent?: Snippet<[boolean]>
} & PanelProps

let {
  isOpen,
  children,
  collapsedContent = undefined,
  managedContent = undefined,
}: Props = $props()
</script>

{#if managedContent}
  <div
    class="bits-theme bits-panel-section-content bits-panel-section-content--managed"
  >
    {@render managedContent(isOpen)}
  </div>
{:else if isOpen && children}
  <div
    class="bits-theme bits-panel-section-content"
    transition:slide={{
      duration: prefersReducedMotion.current ? 0 : 240,
      easing: cubicOut,
    }}
  >
    {@render children()}
  </div>
{:else if collapsedContent}
  <div
    class="bits-theme bits-panel-section-content bits-panel-section-content--collapsed"
  >
    {@render collapsedContent()}
  </div>
{/if}
