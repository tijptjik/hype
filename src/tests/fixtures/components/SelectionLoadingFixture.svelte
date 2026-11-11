<script lang="ts">
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import FormSelectionSkeleton from '#lib/bits/patterns/forms/formSkeleton/components/FormSelectionSkeleton.svelte'
import FormMapStyleSection from '#lib/bits/patterns/forms/formMapStyleSection/FormMapStyleSection.svelte'
import FormMarkerStyleSection from '#lib/bits/patterns/forms/formMarkerStyleSection/FormMarkerStyleSection.svelte'
import FormCardStyleSection from '#lib/bits/patterns/forms/formCardStyleSection/FormCardStyleSection.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// STYLES
import { formSelectionSectionStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
// ICONS
import MapIcon from 'virtual:icons/lucide/map'
import MarkerIcon from 'virtual:icons/lucide/map-pin'
import CardIcon from 'virtual:icons/lucide/panels-top-left'
// I18N
import { m } from '#lib/i18n.js'
setResponsiveCtx()
let ready = $state(false)
const layer = new URLSearchParams(window.location.search).has('layer')
const selections = [
  {
    title: m.theme_map_style_label(),
    subtitle: layer
      ? m.theme_map_layer_style_description()
      : 'Choose the basemap assigned to this project.',
    icon: MapIcon,
  },
  {
    title: 'Marker Style',
    subtitle: layer
      ? 'Inherit the project style or choose an override.'
      : 'Choose how locations appear on the map.',
    icon: MarkerIcon,
  },
  {
    title: m.card_style__title(),
    subtitle: layer
      ? m.card_style__layer_description()
      : m.card_style__project_description(),
    icon: CardIcon,
  },
]
</script>
<div class="bits-theme">
  <button type="button" onclick={() => (ready = !ready)}>Toggle loaded</button>
  <FormSurface>
    <div class="grid grid-cols-1 xl:grid-cols-3">
      {#each selections as selection, index}
        <div
          class="border-border min-w-0 border-b last:border-0 xl:border-r xl:border-b-0"
          data-selection
        >
          {#if !ready}
            <FormSelectionSkeleton {...selection} />
          {:else if index === 0}
            <FormMapStyleSection
              isEditing={false}
              class={formSelectionSectionStyles}
              title={selection.title}
              subtitle={selection.subtitle}
              availableMapStyles={[]}
              onSelectMapStyle={() => {}}
            />
          {:else if index === 1}
            <FormMarkerStyleSection
              allowInherit={layer}
              inputAttrs={{ type: 'hidden' }}
              onSelect={() => {}}
            />
          {:else}
            <FormCardStyleSection
              allowInherit={layer}
              inputAttrs={{ type: 'hidden' }}
              onSelect={() => {}}
            />
          {/if}
        </div>
      {/each}
    </div>
  </FormSurface>
</div>
