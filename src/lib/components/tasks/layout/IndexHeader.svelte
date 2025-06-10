<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Project, Organisation } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();

// PROPS
type Props = {
  project: Project;
  organisation: Organisation;
};

// PROPS
let { project, organisation }: Props = $props();

let projectName = $derived(getI18n(project, 'name', appCtx.getUserPreferences()));
let organisationName = $derived(
  getI18n(organisation, 'name', appCtx.getUserPreferences())
);
</script>

<div
  class="z-20 flex w-full flex-row justify-between gap-8 bg-base-200 px-12 py-7 text-lg font-semibold">
  <h3 class="text-lg">
    {projectName}
    <small class="inline-block pl-3 text-sm text-base-content/50"
      ><span class="font-normal">by</span> {organisationName}</small>
  </h3>
</div>
