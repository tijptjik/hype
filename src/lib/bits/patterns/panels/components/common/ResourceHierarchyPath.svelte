<script lang="ts">
// I18N
import { getI18n } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// TYPES
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'

const appCtx = getSurfaceCtx()

type ResourceHierarchyPathProps = {
  hierarchy?: {
    organisation?: Organisation
    project?: Project
  }
}

let { hierarchy = {} }: ResourceHierarchyPathProps = $props()

const organisationName = $derived(
  hierarchy.organisation
    ? getI18n(hierarchy.organisation, 'nameShort', appCtx.getUserPreferences())
    : '',
)
const projectName = $derived(
  hierarchy.project ? appCtx.getContextualProjectName(hierarchy.project, false) : '',
)
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
