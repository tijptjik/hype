<script lang="ts">
// ICONS
import { MinusCircle, PlusCircle } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { getI18nValue, getLocale } from '$lib/i18n';

const {
  layer,
  project,
  organisation,
  isSelected,
  onClick,
  selectedClass = 'bg-yellow-400'
} = $props();
</script>

<div
  class="flex cursor-pointer flex-row items-center justify-between gap-4 bg-black py-2 pl-8 pr-4 caret-transparent transition-colors duration-200 hover:bg-base-300 focus:outline-none focus:ring-0 focus-visible:text-primary"
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
      <div class="h-2 w-2 rounded-full {isSelected ? selectedClass : ''}"></div>
      <div class="flex flex-col items-start gap-0">
        <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
          {#if getLocale() == 'en'}
            <span class="text-primary"
              >{organisation.code.replaceAll('_', '').replaceAll(' ', '')}</span>
            <span class="px-0">›</span>
            <span class="text-accent"
              >{project.code.replaceAll('_', '').replaceAll(' ', '')}</span>
          {:else}
            <span class="text-primary">{getI18nValue(organisation, 'nameShort')}</span>
            <span class="px-0">›</span>
            <span class="text-accent">{getI18nValue(project, 'nameShort')}</span>
          {/if}
        </p>
        <p class="font-light">{getI18nValue(layer, 'name')}</p>
      </div>
    </div>
  {:else}
    <div class="flex -translate-x-5 flex-row items-center gap-3">
      <div class="h-2 w-2 rounded-full {isSelected ? selectedClass : ''}"></div>
      <p class="font-light">{getI18nValue(layer, 'name')}</p>
    </div>
  {/if}
  <div class="relative text-sm text-base-content/60">
    {#if isSelected}
      <Icon
        src={MinusCircle}
        class="hover: relative h-6 w-6 text-base-content/60"
        aria-hidden="true">
      </Icon>
    {:else}
      <Icon
        src={PlusCircle}
        class="relative h-6 w-6 text-base-content/60"
        aria-hidden="true" />
    {/if}
  </div>
</div>
