<script lang="ts">
// LIB
import { ADMIN_PATH } from '$lib';
import { navigateOnAdmin } from '$lib/navigation';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { Task, TaskType } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();

// PROPS
let { task }: { task: Task } = $props();

const adminCtx = getAdminCtx();

const typeDisplay: Record<TaskType, string> = {
  reportedMissing: m.noble_zany_crow_dance(),
  newPhoto: m.aware_sea_goose_nail(),
  newFeature: m.smart_crazy_cuckoo_play()
};
</script>

{#if task?.type}
  <h3 class=" text-xl font-bold uppercase">
    {typeDisplay[task.type as TaskType]}
    <a
      href={`${ADMIN_PATH}/features/${task.feature?.id}`}
      onclick={(e) =>
        navigateOnAdmin(adminCtx, FirstClassResource.feature, task.feature?.id)}
      class="pr-3 text-sm normal-case text-base-content/70 @sm:block">
      {getI18n(task.feature, 'title', appCtx.getUserPreferences())}</a>
  </h3>
{/if}
