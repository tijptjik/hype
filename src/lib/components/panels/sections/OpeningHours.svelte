<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// SERVICES
import { getGlobalOpeningHoursProperties } from '$lib/client/services/property';
// COMPONENTS
import Section from '$lib/components/panels/common/Section.svelte';
import OpeningHoursFilter from '$lib/components/panels/controls/OpeningHoursFilter.svelte';
import ResourceContainer from '$lib/components/panels/common/ResourceContainer.svelte';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { PanelProps } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();

// PROPS
let { ...panelProps }: PanelProps = $props();
</script>

{#snippet EmptyCollapsed()}
  <!-- No collapsed content for opening hours -->
{/snippet}

{#await getGlobalOpeningHoursProperties(appCtx) then config}
  {#if config}
    <Section
      title={m.filters__opening_hours()}
      icon="/openinghours.svg"
      iconVerticalPaddingClass="pt-1"
      iconColorClass="text-primary"
      collapsedContent={EmptyCollapsed}
      {...panelProps}>
      <ResourceContainer>
        {#if config.hasWeekday}
          <OpeningHoursFilter type="weekday" defaultOpen={true} />
        {/if}
        {#if config.hasWeekend}
          <OpeningHoursFilter type="weekend" defaultOpen={false} />
        {/if}
      </ResourceContainer>
    </Section>
  {/if}
{/await}
