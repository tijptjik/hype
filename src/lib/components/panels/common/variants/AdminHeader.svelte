<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Bolt, Bars3 as Menu } from '@steeze-ui/heroicons';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { PanelProps } from '$lib/types';
import { Panel } from '$lib/enums';

// PROPS
let {
  title,
  isNarrow
}: {
  title: string;
} & PanelProps = $props();

// CONTEXT
const appCtx = getAppCtx();
</script>

<div
  class="flex h-[72px] flex-shrink-0 flex-row items-center justify-between bg-black p-4">
  {#if !isNarrow}
    <h1 class="text-lg font-semibold uppercase text-white">{title}</h1>
    <div class="flex gap-2">
      <button
        class="btn btn-circle btn-ghost m-0"
        onclick={() => {
          // Clear any visual-only state when explicitly toggling
          appCtx.closePanelVisually(Panel.admin);
          appCtx.togglePanel(Panel.admin);
        }}>
        <Icon src={Menu} class="h-6 w-6" />
      </button>
    </div>
  {:else}
    <div
      class="m-0 flex w-full items-center justify-center p-1"
      onclick={() => {
        // Clear any visual-only state when explicitly toggling
        appCtx.closePanelVisually(Panel.admin);
        appCtx.togglePanel(Panel.admin);
      }}>
      <Icon src={Bolt} class="h-8 w-8 text-primary" />
    </div>
  {/if}
</div>
