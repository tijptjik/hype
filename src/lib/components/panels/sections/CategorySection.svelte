<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition';
import { ChevronDown, ChevronRight } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import type { Snippet } from 'svelte';
import type { IconSource } from '@steeze-ui/svelte-icon';
// I18N
import { getI18n } from '$lib/i18n';
// CONTEXT
import type { AppCtx } from '$lib/context/app.svelte';

const toggle = () => {
  isOpen = !isOpen;
};

type Props = {
  children: Snippet;
  title: string;
  icon: string | IconSource;
  iconVerticalPaddingClass: string;
  iconColorClass: string;
  collapsedContent?: Snippet<[string, any]>;
  isOpen: boolean;
  hierarchy: {
    organisation?: string | null;
    project?: string | null;
    layer?: string | null;
    layerId: string;
    projectId: string;
  };
  properties: Record<string, any>;
  appCtx: AppCtx;
};

let {
  children,
  title,
  icon,
  iconVerticalPaddingClass,
  iconColorClass,
  collapsedContent,
  isOpen = false,
  hierarchy,
  properties,
  appCtx
}: Props = $props();

// Get project nameShort from i18n
let projectNameShort = $derived.by(() => {
  const project = appCtx.cache.project.get(hierarchy.projectId);
  if (!project) return null;
  return getI18n(project, 'nameShort', appCtx.getUserPreferences());
});
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
          {#if projectNameShort}
            <span class="text-accent">{projectNameShort.replaceAll('_', '')}</span>
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
  {:else if collapsedContent}
    {@render collapsedContent(hierarchy.layerId, properties)}
  {/if}
</div>
