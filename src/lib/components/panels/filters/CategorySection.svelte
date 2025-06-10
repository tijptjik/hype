<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition';
import { ChevronDown, ChevronRight } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';

const toggle = () => {
  isOpen = !isOpen;
};

type Props = {
  children: any;
  title: string;
  icon: string;
  iconVerticalPaddingClass: string;
  iconColorClass: string;
  collapsedContent: any;
  isOpen: boolean;
  hierarchy: any;
  properties: any;
};

let {
  children,
  title,
  icon,
  iconVerticalPaddingClass,
  iconColorClass,
  collapsedContent = () => null,
  isOpen = false,
  hierarchy,
  properties
}: Props = $props();
</script>

<div
  class="mt-4 flex min-h-0 flex-shrink-0 flex-col border-t-4 border-base-300 caret-transparent {isOpen
    ? 'flex-grow'
    : ''}"
  transition:slide>
  <button
    class="flex w-full flex-shrink-0 items-center justify-between px-4 {iconVerticalPaddingClass} bg-black pb-2 focus:outline-none focus:ring-0 focus-visible:text-primary"
    onclick={toggle}>
    <div class="flex items-center gap-3">
      <Icon src={isOpen ? ChevronDown : ChevronRight} class="h-[18px] w-[18px]" />
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
            <span class="px-0">›</span>
            <span class="text-secondary">{hierarchy.layer.replaceAll(' ', '')}</span>
          {/if}
        </div>
        <!-- Title row -->
        <div class="flex items-center gap-2">
          <h3 class="text-sm uppercase tracking-widest">
            {title}
          </h3>
        </div>
      </div>
    </div>
    {#if typeof icon === 'string'}
      <img
        src={icon}
        alt=""
        class="h-12 -translate-x-0.5 translate-y-2 text-base-content/60"
        aria-hidden="true" />
    {:else}
      <Icon
        src={icon}
        class="h-12 w-8 {iconColorClass} translate-y-4"
        aria-hidden="true" />
    {/if}
  </button>

  {#if isOpen}
    {@render children()}
  {:else}
    {@render collapsedContent(hierarchy.layerId, properties)}
  {/if}
</div>
