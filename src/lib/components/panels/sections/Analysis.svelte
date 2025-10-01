<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
import FilteredAnalysis from '$lib/components/panels/common/variants/FilteredAnalysis.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { PanelProps } from '$lib/types';

// PROPS
let { ...panelProps }: PanelProps = $props();

// CONTEXT
const appCtx = getAppCtx();

// DERIVED STATE
const shouldShowAnalysis = $derived(() => {
  // Check if any active layers belong to a project with code 'foodaccess'
  const activeLayerIds = appCtx.state.prisms.layer;

  for (const layerId of activeLayerIds) {
    const layer = appCtx.getResourceByIdSync(FirstClassResource.layer, layerId) as any;
    if (layer && layer.projectId) {
      const project = appCtx.getResourceByIdSync(
        FirstClassResource.project,
        layer.projectId
      ) as any;
      if (project && project.code === 'foodaccess') {
        return true;
      }
    }
  }

  return false;
});
</script>

{#if shouldShowAnalysis()}
  <div transition:slide={{ duration: 300 }}>
    <Section
      title="Analysis"
      icon="/analysis.svg"
      iconVerticalPaddingClass="pt-4"
      iconColorClass="text-accent"
      {...panelProps}>
      <ResourceContainer>
        <FilteredAnalysis title="Walking Distance" />
      </ResourceContainer>
    </Section>
  </div>
{/if}
