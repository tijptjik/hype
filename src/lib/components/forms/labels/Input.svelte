<script lang="ts">
import { fly } from 'svelte/transition'

// TYPES
type Props = {
  isGenAI: boolean
  onToggleGenAI?: (e: MouseEvent) => void
}

const { isGenAI, onToggleGenAI }: Props = $props()
</script>

<div
  class="tooltip tooltip-top cursor-pointer pr-1 pt-0.5 transition-opacity [--tooltip-color:#191E24] group-focus-within:opacity-0"
  style="--tooltip-offset: 22px; --tooltip-tail-offset:25px"
  data-tip={isGenAI ? 'Machine Translated' : 'Human Validated'}
  onclick={onToggleGenAI}
>
  <div class="flex-shrink-0 opacity-70">
    {#if isGenAI}
      <svg
        in:fly={{ x: -12 }}
        out:fly={{ x: 12 }}
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        class="absolute -top-4 right-1 h-6 w-6"
      >
        <g
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        >
          <rect width="20" height="14" x="2" y="9" rx="4"></rect>
          <circle cx="12" cy="3" r="2"></circle>
          <path d="M12 5v4m-3 8v-2m6 0v2"></path>
        </g>
      </svg>
    {:else}
      <svg
        in:fly={{ x: 12 }}
        out:fly={{ x: -12 }}
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24 "
        class="absolute -top-4 right-1 h-6 w-6"
      >
        <g fill="none" stroke="currentColor" stroke-width="1.8">
          <path
            d="M3 16V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z"
          ></path>
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.5 14.5s-1.5 2-4.5 2s-4.5-2-4.5-2"
          ></path>
          <path
            fill="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.5 10a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1m7 0a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1"
          ></path>
        </g>
      </svg>
    {/if}
  </div>
</div>
