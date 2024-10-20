<script lang="ts">
import type { Component } from 'svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';

let {
  title,
  Actions = undefined,
  Info = undefined
}: {
  title: string;
  Actions?: Component;
  Info?: Component;
} = $props();
</script>

<div class="flex flex-col gap-2 h-20 px-6 bg-base-100">
  <div class="flex items-center h-20 gap-4">
    <Icon src={ChevronRight} class="h-6 w-6" />
    <h3 class="text-lg">{title}</h3>
  </div>
  {#if Actions}
    <div class="flex items-center gap-6">
      {Actions}
    </div>
  {/if}
  {#if Info}
    <div class="flex items-center gap-6">
      {Info}
    </div>
  {/if}
</div>
