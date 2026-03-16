<script lang="ts">
import { getI18n } from '$lib/i18n'
import { getAppCtx } from '$lib/context/app.svelte'
const appCtx = getAppCtx()

let {
  hierarchy = {},
}: {
  hierarchy?: { organisation?: any; project?: any; layer?: any }
} = $props()

let organisationName = hierarchy.organisation
  ? getI18n(hierarchy.organisation, 'nameShort', appCtx.getUserPreferences())
  : ''
let projectName = hierarchy.project
  ? appCtx.getContextualProjectName(hierarchy.project, false)
  : ''
</script>

{#if organisationName || projectName}
  <p class="flex items-start space-x-0.5 font-mono text-xs uppercase tracking-widest">
    {#if organisationName}
      <span class="min-w-0 text-primary">{organisationName}</span>
    {/if}
    {#if projectName}
      <span class="shrink-0 px-0">›</span>
      <span class="min-w-0 text-accent">{projectName}</span>
    {/if}
  </p>
{/if}
