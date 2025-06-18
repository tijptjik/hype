<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';

let {
  title,
  icon,
  statuses,
  showTitle = true
}: {
  title: string;
  icon?: any;
  statuses: boolean[];
  showTitle?: boolean;
} = $props();
</script>

<div class="flex h-10 flex-col items-center gap-2">
  <span class="text-xs text-base-content/60">
    {#if showTitle}
      <span class="hidden @[78rem]/main:block">{title}</span>
      {#if icon}
        <span class="block @[78rem]/main:hidden">
          <Icon src={icon} class="h-4 w-4" />
        </span>
      {/if}
    {:else if icon}
      <Icon src={icon} class="h-4 w-4" />
    {/if}
  </span>
  <div class="flex gap-1.5">
    {#each statuses as status}
      <div
        class="h-2 w-2 rounded-full {status ? 'bg-ok' : 'bg-error/50'}"
      ></div>
    {/each}
  </div>
</div>

<style>
  @media (min-width: 1500px) {
    .hidden.xl\\:block {
      display: block !important;
    }
    .block.xl\\:hidden {
      display: none !important;
    }
  }
</style> 