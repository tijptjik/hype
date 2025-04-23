<script lang="ts">
// ICONS
import { Funnel, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { getI18nValue, getLocale } from '$lib/i18n';

const {
  resource,
  resourceParent = undefined,
  isSelected,
  onClick,
  selectedClass = 'bg-blue-400'
} = $props();
</script>

<div
  class="flex cursor-pointer flex-row items-center justify-between gap-4 bg-black py-2 pl-8 pr-4 transition-colors duration-200 hover:bg-base-300"
  onclick={onClick}>
  <div class="flex -translate-x-5 flex-row items-center gap-3">
    <div class="h-2 w-2 rounded-full {isSelected ? selectedClass : ''}"></div>
    <div class="flex flex-col items-start gap-0">
      {#if resourceParent}
        <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
          {#if getLocale() == 'en'}
            <span class="text-primary"
              >{resourceParent.code.replaceAll('_', '').replaceAll(' ', '')}</span>
          {:else}
            <span class="text-primary"
              >{getI18nValue(resourceParent, 'nameShort')}</span>
          {/if}
        </p>
      {/if}
      <p class="font-light">{getI18nValue(resource, 'name')}</p>
    </div>
  </div>
  <div class="text-sm text-base-content/60">
    <Icon
      src={isSelected ? XMark : Funnel}
      class="h-6 w-6 text-base-content/20"
      aria-hidden="true" />
  </div>
</div>
