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
  statuses: Record<string, boolean | null>;
  showTitle?: boolean;
} = $props();
</script>

<div class="pointer-events-auto flex h-10 flex-col items-center gap-2">
  <span class="text-xs text-base-content/60">
    {#if showTitle}
      <span class="hidden uppercase @[78rem]/main:block">{title}</span>
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
    {#each Object.entries(statuses) as [key, status]}
      <div class="tooltip" data-tip={key}>
        <div
          class="h-2 w-2 rounded-full {status === true
            ? 'bg-ok'
            : status === false
              ? 'bg-error/50'
              : 'bg-pending'}">
        </div>
      </div>
    {/each}
  </div>
</div>
