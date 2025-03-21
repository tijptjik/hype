<script lang="ts">
// ICONS
import { Funnel, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// I18N
import { getI18nValue, languageTag } from '$lib/i18n';

const {
  resource,
  resourceParent = undefined,
  isSelected,
  onClick,
  selectedClass = 'text-blue-400'
} = $props();
</script>

<div
  class="flex cursor-pointer flex-row items-center justify-between gap-4 bg-black py-2 pl-8 pr-4 transition-colors duration-200 hover:bg-base-300 {isSelected
    ? selectedClass
    : ''}"
  onclick={onClick}>
  {#if resourceParent}
    <div class="flex flex-col items-start gap-0">
      <p class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
        {#if languageTag() == 'en'}
          <span class="text-primary"
            >{resourceParent.code.replaceAll('_', '').replaceAll(' ', '')}</span>
        {:else}
          <span class="text-primary">{getI18nValue(resourceParent, 'nameShort')}</span>
        {/if}
      </p>
      <p class="font-light">{getI18nValue(resource, 'name')}</p>
    </div>
  {:else}
    <p class="font-light">{getI18nValue(resource, 'name')}</p>
  {/if}
  <div class="text-sm text-base-content/60">
    <Icon
      src={isSelected ? XMark : Funnel}
      class="h-6 w-6 text-base-content/20"
      aria-hidden="true" />
  </div>
</div>
