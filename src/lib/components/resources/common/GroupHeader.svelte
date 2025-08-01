<script lang="ts" generics="G extends Record<string, any>">
// I18N
import { m } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ICONS
import { ChevronRight } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';

let {
  group,
  isCollapsed = $bindable(),
  entityCount
}: {
  group: G;
  isCollapsed?: boolean;
  entityCount: number;
} = $props();

// CONTEXT
const adminCtx = getAdminCtx();

const title =
  getI18n(group as Record<'i18n', any>, 'name', adminCtx.appCtx.getUserPreferences()) ??
  (group as any).id ??
  'Unknown';

const subtitle = $derived(
  `${entityCount} ${entityCount === 1 ? m.born_plane_javelina_strive() : m.born_plane_javelina_strive_plural()}`
);

function toggleCollapsed() {
  isCollapsed = !isCollapsed;
}
</script>

<div
  class="flex h-12 flex-row items-center justify-between gap-2 rounded-2xl bg-transparent px-6 pb-6 pt-12 @container">
  <button
    class="flex h-12 cursor-pointer items-center gap-4 transition-opacity hover:opacity-80"
    onclick={toggleCollapsed}>
    <!-- Collapse/Expand Icon -->
    <div class="transition-transform duration-200" class:rotate-90={!isCollapsed}>
      <Icon src={ChevronRight} class="h-5 w-5 stroke-[4px] [&>path]:stroke-inherit" />
    </div>

    <h3 class="flex-shrink-1 text-xl font-bold uppercase">
      {title}
    </h3>
  </button>
  <small
    class="hidden select-text pr-3 text-sm capitalize text-base-content/50 @sm:block"
    >{@html subtitle}</small>
</div>
