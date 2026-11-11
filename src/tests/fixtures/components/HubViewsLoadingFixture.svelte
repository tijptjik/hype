<script lang="ts">
// COMPONENTS
import ResourceFormSkeleton from '#lib/bits/patterns/forms/formSkeleton/ResourceFormSkeleton.svelte'
import FormHubLayersSection from '#lib/bits/patterns/forms/formHubLayersSection/FormHubLayersSection.svelte'
import ImageIntentSettings from '#lib/bits/patterns/images/ImageIntentSettings.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// DOMAIN
import { DEFAULT_IMAGE_INTENTS } from '#lib/images/intents.js'
import { m } from '#lib/i18n.js'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
setResponsiveCtx()
const facet = new URLSearchParams(window.location.search).get('facet') ?? 'layers'
let phase = $state(0)
const items = [2, 4, 4].flatMap((count, group) =>
  Array.from({ length: count }, (_, row) => ({
    id: `layer-${group}-${row}`,
    organisationId: `org-${group}`,
    organisationName: [
      'City Recorder',
      'Cultural & Media Education Foundation',
      'EU National Institutes for Culture',
    ][group],
    projectNameShort: 'Project name',
    layerName: row ? 'Permanently Closed' : 'Current',
    isDefaultVisible: row === 0,
  })),
)
/** Advance resource loading, then resolve a pending catalogue request.
 * @returns Nothing.
 */
function advance(): void {
  phase++
  if (phase === 2)
    window.dispatchEvent(
      new CustomEvent('resolve-image-policy', {
        detail: {
          intents: DEFAULT_IMAGE_INTENTS,
          hubIntents: DEFAULT_IMAGE_INTENTS,
          inherited: false,
          autoPublishUnclassified: true,
          usage: {},
          version: 1,
          hubVersion: 1,
        },
      }),
    )
}
</script>
<div class="bits-theme">
  <button type="button" onclick={advance}>Resolve next</button>
  <div data-comparison>
    {#if phase === 0}
      <ResourceFormSkeleton
        resource="hub"
        {facet}
        locales={['en', 'zhHant', 'zhHans']}
      />
    {:else if facet === 'layers'}
      <FormSurface class={`${resourceTabsStyles} flex min-h-0 flex-1 flex-col`}>
        <FormHubLayersSection
          title={m.maps__layers()}
          subtitle={m.admin__forms_hub_layers_subtitle()}
          localeKey="en"
          {items}
          isEditing={false}
          onToggleDefault={() => {}}
        />
      </FormSurface>
    {:else if facet === 'advanced'}
      <FormSurface
        ><div class="flex min-w-0 flex-col pb-6">
          <ImageIntentSettings scopeType="hub" scopeId="fixture" disabled />
        </div></FormSurface
      >
    {/if}
  </div>
</div>
