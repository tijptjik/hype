<script lang="ts">
// TYPES
let { category, class: className = '' }: { category: string; class?: string } = $props()
</script>

<svg
  viewBox="0 0 24 24"
  class={className}
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if category === 'elevator'}
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M8 9l2-3 2 3m-2-3v6m2 3l2 3 2-3m-2 3v-6" />
  {:else if category === 'escalator'}
    <path d="M3 18h5l9-10h4M3 14h3l9-10h6M3 14v4m18-14v4" />
    <circle cx="9" cy="4" r="1" />
    <path d="M9 7v4" />
  {:else if category === 'ramp'}
    <path d="M3 19h18M3 16L21 6M5 12V8m0 0h5m-5 0l5 4" />
  {:else}
    <path d="M3 20h5v-5h5v-5h5V5h3" />
  {/if}
</svg>
