<script lang="ts">
import { slide } from 'svelte/transition';
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
  collapsedContent = undefined,
  position = 'left'
} = $props<{
  title: string;
  icon: string | IconSource; // Path to SVG file
  iconVerticalPaddingClass?: string;
  iconColorClass?: string;
  description?: string;
  defaultOpen?: boolean;
  children?: any;
  collapsedContent?: any;
  position?: 'left' | 'right';
}>();

let isOpen = $state(defaultOpen);

const toggle = () => {
  isOpen = !isOpen;
};
</script>

<section
  class="flex min-h-0 flex-col overflow-hidden bg-black caret-transparent {isOpen
    ? 'flex-grow-0'
    : 'flex-shrink-0'} {position === 'left' ? 'pr-4' : ''}">
  <button
    class="flex w-full flex-shrink-0 items-center justify-between px-4 {iconVerticalPaddingClass} bg-black text-base-content focus:outline-none focus:ring-0 focus-visible:text-primary"
    onclick={toggle}
    aria-expanded={isOpen}
    tabindex="0">
    <div class="flex items-center gap-3">
      <div class="space-y-0.5">
        <div class="flex items-center gap-3">
          <Icon src={isOpen ? ChevronDown : ChevronRight} class="h-[18px] w-[18px]" />
          <h3 class="text-sm uppercase tracking-widest">
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
      <Icon
        src={icon}
        class="h-12 w-8 {iconColorClass} translate-x-0.5"
        aria-hidden="true" />
    {/if}
  </button>

  {#if isOpen && children}
    <div
      class="flex min-h-0 flex-grow flex-col bg-black caret-white"
      transition:slide={{ duration: 200 }}>
      {@render children()}
    </div>
  {:else if collapsedContent}
    <div class="flex min-h-6 flex-shrink-0 flex-grow flex-col">
      {@render collapsedContent()}
    </div>
  {/if}
</section>
