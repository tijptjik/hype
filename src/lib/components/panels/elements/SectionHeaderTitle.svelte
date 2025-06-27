<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronDown, ChevronRight } from '@steeze-ui/heroicons';
// TYPES
import type { PanelProps } from '$lib/types';

// PROPS
let { title, description, isOpen, onToggle, onNavigate, href, ...panelProps } = $props<{
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: (e: MouseEvent) => void;
  onNavigate?: (e: MouseEvent) => void;
  href: string;
  panelProps: PanelProps;
}>();
</script>

<div class="flex items-center gap-3">
  <div class="space-y-0.5">
    <div class="flex items-center gap-3">
      <Icon
        src={isOpen ? ChevronDown : ChevronRight}
        class="h-[18px] w-[18px]"
        onclick={onToggle} />
      <a {href} onclick={href ? onNavigate : onToggle}>
        <h3 class="text-sm uppercase tracking-widest">
          {title}
        </h3>
      </a>
    </div>
    {#if description}
      <p class="text-left text-sm text-base-content/60">{description}</p>
    {/if}
  </div>
</div>
