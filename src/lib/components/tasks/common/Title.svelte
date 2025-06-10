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

<div class="flex flex-row items-center gap-4 text-lg">
  <Icon src={ChevronRight} class="h-6 w-6" />
  <h3 class="text-lg">
    {typeDisplay[task.type as TaskType]}
    <a
      href={`${ADMIN_PATH}/features/${task.feature?.id}`}
      onclick={(e) =>
        navigateOnAdmin(adminCtx, FirstClassResource.feature, task.feature?.id)}
      class="pl-3 text-sm text-base-content/50">
      {getI18n(task.feature, 'title', appCtx.getUserPreferences())}</a>
  </h3>
</div>
