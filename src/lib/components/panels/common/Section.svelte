<script lang="ts">
import { fly } from 'svelte/transition';
import { ChevronDown, ChevronRight } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import type { IconSource } from '@steeze-ui/heroicons';

let {
  title,
  icon,
  iconVerticalPaddingClass = 'py-3',
  iconColorClass = 'text-base-content/60',
  description = undefined,
  defaultOpen = true,
  children,
  collapsedContent = undefined
} = $props<{
  title: string;
  icon: string | IconSource; // Path to SVG file
  iconVerticalPaddingClass?: string;
  iconColorClass?: string;
  description?: string;
  defaultOpen?: boolean;
  children?: any;
  collapsedContent?: any;
}>();

let isOpen = $state(defaultOpen);

const toggle = () => {
  isOpen = !isOpen;
};
</script>

<div class="flex min-h-0 flex-col {isOpen ? 'flex-grow' : 'flex-shrink-0'}">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between px-4 {iconVerticalPaddingClass} bg-black"
    onclick={toggle}
    aria-expanded={isOpen}>
    <div class="flex items-center gap-3">
      <div class="space-y-0.5">
        <div class="flex items-center gap-3">
          <Icon
            src={isOpen ? ChevronDown : ChevronRight}
            class="h-4 w-4 text-base-content/60" />
          <h3 class="text-sm font-thin uppercase tracking-widest text-base-content">
            {title}
          </h3>
        </div>
        {#if description}
          <p class="text-left text-sm text-base-content/60">{description}</p>
        {/if}
      </div>
    </div>

    {#if typeof icon === 'string'}
      <img src={icon} alt="" class="h-12 text-base-content/60" aria-hidden="true" />
    {:else}
      <Icon src={icon} class="h-12 w-8 {iconColorClass}" aria-hidden="true" />
    {/if}
  </button>

  {#if isOpen && children}
    <div class="flex min-h-0 flex-grow flex-col">
      {@render children()}
    </div>
  {:else if collapsedContent}
    <div class="flex min-h-6 flex-grow flex-shrink-0 flex-col">
      {@render collapsedContent()}
    </div>
  <!-- {:else} -->
  <!-- <div class="flex min-h-0 flex-grow flex-col">
      <div class="h-[1px] w-full bg-base-200">
        <p>All</p>
      </div>
    </div> -->
  {/if}
</div>
