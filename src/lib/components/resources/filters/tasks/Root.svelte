<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// ANIMATION
import { slide } from 'svelte/transition';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import StatusSection from './Status.svelte';
// ICONS
import { CircleStack, Funnel, XMark } from '@steeze-ui/heroicons';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { TaskViewFilters, TaskStatusFilterKey } from '$lib/types';

let { count } = $props();

const adminCtx = getAdminCtx();

// FILTER SECTIONS CONFIG
const filterSections = {
  status: { icon: CircleStack, title: m.filters__status() }
};

const filterKeys: Record<string, (keyof TaskViewFilters)[]> = {
  status: ['isReviewed'] as TaskStatusFilterKey[]
};

const getFilterCount = (section: string) => {
  const taskFilters = adminCtx.state.viewFilters.task;
  let count = 0;

  if (filterKeys[section]) {
    filterKeys[section].forEach((key) => {
      if (taskFilters[key as keyof TaskViewFilters] !== null) {
        count++;
      }
    });
  }
  return count;
};

const totalFilterCount = $derived(() => {
  let total = 0;
  for (const section of Object.keys(filterSections)) {
    total += getFilterCount(section);
  }
  return total;
});

// HANDLERS
function resetFilters() {
  adminCtx.resetViewFilters();
}
</script>

<div
  class="relative flex h-16 w-full flex-row items-center justify-between gap-4 bg-base-200"
  transition:slide>
  <div class="group/sections bg-200 mx-4 flex h-16 items-center gap-4 bg-base-200">
    <!-- Anchor -->
    <div
      class="group/anchor mr-4 flex items-center justify-center opacity-70 transition-opacity duration-300 hover:opacity-100">
      <button
        class="btn btn-ghost btn-sm h-10 group-hover/anchor:bg-transparent group-hover/anchor:text-white">
        <Icon src={CircleStack} class="h-6 w-6" />
        <span class="hidden sm:inline">{m.filters__status()}</span>
      </button>
    </div>
    <div class="relative flex flex-row items-center">
      <div class="absolute z-20 flex w-auto flex-row justify-center gap-2">
        <!-- Status Filters -->
        <StatusSection />
      </div>
    </div>
  </div>
  <div class="flex items-center gap-4 pr-8 text-base-content/60">
    <div class="text-sm">
      <span>{count}</span>
      <span>{m.busy_flaky_mayfly_chop()}</span>
    </div>
    <button
      class="btn btn-circle btn-ghost btn-sm"
      onclick={resetFilters}
      disabled={totalFilterCount() === 0}>
      <Icon src={XMark} class="h-4 w-4" />
    </button>
  </div>
</div>
