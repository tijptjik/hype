<script lang="ts">
import { fly } from 'svelte/transition';
import { ChevronDown, ChevronRight, ChevronUp } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import type { IconSource } from '@steeze-ui/heroicons';

const toggle = () => {
  isOpen = !isOpen;
};

let {
  children,
  title,
  icon,
  iconVerticalPaddingClass,
  iconColorClass,
  hierarchy,
  collapsedContent = () => null,
  isOpen = false
} = $props();
</script>

<div class="flex min-h-0 mt-4 flex-col flex-shrink-0 {isOpen ? 'flex-grow' : ''}">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between px-4 {iconVerticalPaddingClass} bg-black"
    onclick={toggle}>
    <div class="flex items-center gap-3">
      <Icon
        src={isOpen ? ChevronDown : ChevronRight}
        class="h-4 w-4 text-base-content/60" />
      <!-- Hierarchy path -->
      <div class="flex flex-col space-y-1">
        <div class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
          {#if hierarchy && hierarchy.organisation}
            <span class="px-0 text-primary">{hierarchy.organisation}</span>
          {/if}
          {#if hierarchy && hierarchy.project}
            <span class="px-0">›</span>
            <span class="text-accent">{hierarchy.project.replaceAll('_', '')}</span>
          {/if}
          {#if hierarchy && hierarchy.layer}
            <span class="text-primary">›</span>
            <span class="text-secondary">{hierarchy.layer.replaceAll(' ', '')}</span>
          {/if}
        </div>
        <!-- Title row -->
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-thin uppercase tracking-widest text-neutral-300">
            {title}
          </h3>
        </div>
      </div>
    </div>
    {#if typeof icon === 'string'}
      <img src={icon} alt="" class="h-12 text-base-content/60" aria-hidden="true" />
    {:else}
      <Icon src={icon} class="h-12 w-8 {iconColorClass}" aria-hidden="true" />
    {/if}
  </button>

  {#if isOpen}
      {@render children()}
  {:else}
    {@render collapsedContent()}
  {/if}
</div>
