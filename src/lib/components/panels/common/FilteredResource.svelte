<script lang="ts">
// ICONS
import { Funnel, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { getI18n, getLocale } from '$lib/i18n';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';

// CONTEXT
const mapCtx = getMapCtx();

// PROPS
const {
  resource,
  resourceParent = undefined,
  isSelected,
  onClick,
  selectedClass = 'bg-blue-400'
} = $props();
</script>

<div
  class="group flex cursor-pointer flex-row items-center justify-between gap-4 bg-black py-2 pl-8 pr-4 text-base-content caret-transparent transition-colors duration-200 focus:outline-none focus:ring-0"
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
      input?.focus();
    }
  }}
  tabindex="0">
  <div class="flex -translate-x-5 flex-row items-center gap-3">
    <div
      class="h-2 w-2 rounded-full group-hover:bg-base-content/30 group-focus-visible:bg-base-content/30 {isSelected
        ? selectedClass
        : ''} {isSelected && selectedClass == 'bg-primary'
        ? 'group-hover:bg-primary/75 group-focus-visible:bg-primary/75'
        : ''} {isSelected && selectedClass == 'bg-accent'
        ? 'group-hover:bg-accent/75 group-focus-visible:bg-accent/75'
        : ''} {isSelected && selectedClass == 'bg-secondary'
        ? 'group-hover:bg-secondary/75 group-focus-visible:bg-secondary/75'
        : ''}">
    </div>
    <div class="flex flex-col items-start gap-0">
      {#if resourceParent}
        <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
          <span class="text-primary"
            >{getI18n(resourceParent, 'nameShort', mapCtx.getUserPreferences())}
          </span>
        </p>
      {/if}
      <p class="font-light">{getI18n(resource, 'name', mapCtx.getUserPreferences())}</p>
    </div>
  </div>
  <div
    class="text-sm text-base-content/20 group-hover:text-base-content/40 group-focus-visible:text-base-content/40">
    <Icon src={isSelected ? XMark : Funnel} class="h-6 w-6 " aria-hidden="true" />
  </div>
</div>
