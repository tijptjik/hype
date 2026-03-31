<script lang="ts">
import { fade } from 'svelte/transition'

const { hasCollapsedOverflow, expanded, handleToggle } = $props()
</script>

{#if hasCollapsedOverflow}
  <button
    class="btn btn-ghost btn-xs absolute bottom-1 right-2 z-30 border border-gray-600/30 text-gray-400 backdrop-blur-sm hover:border-gray-500/50 hover:bg-gray-800/50 hover:text-gray-200"
    onclick={handleToggle}
    title={expanded ? 'Collapse description' : 'Expand description'}
    transition:fade={{ duration: 200 }}
  >
    {#if expanded}
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 15l7-7 7 7"
        ></path>
      </svg>
    {:else}
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        ></path>
      </svg>
    {/if}
  </button>
{/if}
