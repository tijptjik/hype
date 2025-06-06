<script lang="ts">
// LIB
import { ADMIN_PATH } from '$lib';
import { navigateOnAdmin } from '$lib/navigation';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
// ENUMS
import { HierarchicalResource } from '$lib/enums';
// TYPES
import type { Task, TaskType, Feature } from '$lib/types';


// CONTEXT
const mapCtx = getMapCtx();

// PROPS
let { task }: { task: Task } = $props();

const resourceState = getHierarchicalResourceState();

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
        navigateOnAdmin(resourceState, HierarchicalResource.feature, task.feature?.id)}
      class="pl-3 text-sm text-base-content/50">
      {getI18n(task.feature as Feature, 'title', mapCtx.getUserPreferences())}</a>
  </h3>
</div>
