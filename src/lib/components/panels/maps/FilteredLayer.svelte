<script lang="ts">
// ICONS
import { MinusCircle, PlusCircle } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { getI18n, getLocale } from '$lib/i18n';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';

// CONTEXT
const mapCtx = getMapCtx();

// PROPS
const {
  layer,
  project,
  organisation,
  isSelected,
  onClick,
  selectedClass = 'bg-yellow-400'
} = $props();

let organisationName = $derived(
  getI18n(organisation, 'nameShort', mapCtx.getUserPreferences())
);

let projectName = $derived(mapCtx.getContextualProjectName(project, false));
</script>

<div
  class="group flex cursor-pointer flex-row items-center justify-between gap-4 bg-black py-2 pl-8 pr-4 caret-transparent transition-colors duration-200 focus:outline-none focus:ring-0"
  onclick={onClick}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClick();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      // Find the nearest section ancestor and focus its input
      const section = e.currentTarget.closest('section');
      const input = section?.querySelector('input');
      if (input) {
        input.focus();
      } else {
        const button = section?.querySelector('button');
        button?.focus();
      }
    }
  }}
  tabindex="0">
  {#if organisation && project}
    <div class="flex -translate-x-5 flex-row items-center gap-3">
      <div
        class="h-2 w-2 rounded-full group-hover:bg-base-content/30 group-focus-visible:bg-base-content/30 {isSelected
          ? selectedClass
          : ''} {isSelected
          ? 'group-hover:bg-secondary/75 group-focus-visible:bg-secondary/75'
          : ''}">
      </div>
      <div class="flex flex-col items-start gap-0">
        <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
          {#if organisationName}
            <span class="text-primary">{organisationName}</span>
          {/if}
          {#if projectName}
            <span class="px-0">›</span>
            <span class="text-accent">{projectName}</span>
          {/if}
        </p>
        <p class="font-light">
          {getI18n(layer, 'nameShort', mapCtx.getUserPreferences())}
        </p>
      </div>
    </div>
  {:else}
    <div class="flex -translate-x-5 flex-row items-center gap-3">
      <div
        class="h-2 w-2 rounded-full group-hover:bg-base-content/30 group-focus-visible:bg-base-content/30 {isSelected
          ? selectedClass
          : ''} {isSelected
          ? 'group-hover:bg-secondary/75 group-focus-visible:bg-secondary/75'
          : ''}">
      </div>
      <p class="font-light">{getI18n(layer, 'name', mapCtx.getUserPreferences())}</p>
    </div>
  {/if}
  <div
    class="relative text-sm text-base-content/60 group-hover:text-base-content/80 group-focus-visible:text-base-content/80">
    {#if isSelected}
      <Icon src={MinusCircle} class="relative h-6 w-6" aria-hidden="true"></Icon>
    {:else}
      <Icon src={PlusCircle} class="relative h-6 w-6" aria-hidden="true" />
    {/if}
  </div>
</div>
