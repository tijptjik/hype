<script lang="ts">
import { Button } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
import { FormParentSection } from '#lib/bits/patterns/forms/formParentSection/index.js'
// ICONS
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import ProjectIcon from 'virtual:icons/proicons/grid'
import LayerIcon from 'virtual:icons/proicons/layers'
import EraserIcon from 'virtual:icons/proicons/eraser'
import type { FormFeatureParentSectionProps } from './formFeatureParentSection.types'

let {
  class: className = '',
  subHeader,
  sharedSectionProps = {},
  isEditing = false,
  onClearAll,
  organisationSection,
  projectSection,
  layerSection,
}: FormFeatureParentSectionProps = $props()
</script>

<section
  class={['bits-form__section', 'bits-feature-parent-section', className]
    .filter(Boolean)
    .join(' ')}
>
  <div class="bits-feature-parent-section__grid">
    <FormParentSection
      title={m.resource__organisation_singular()}
      icon={OrganisationIcon}
      {subHeader}
      {...sharedSectionProps}
      {...organisationSection}
    />
    <FormParentSection
      title={m.resource__project_singular()}
      icon={ProjectIcon}
      {subHeader}
      {...sharedSectionProps}
      {...projectSection}
      fallbackImage={projectSection.fallbackImage ??
        (projectSection.parent?.id
          ? `/api/mapRenders/projects/${projectSection.parent.id}/asset`
          : null)}
    />
    <FormParentSection
      title={m.resource__layer_singular()}
      icon={LayerIcon}
      {subHeader}
      {...sharedSectionProps}
      {...layerSection}
      fallbackImage={layerSection.fallbackImage ??
        (layerSection.parent?.id
          ? `/api/mapRenders/layers/${layerSection.parent.id}/asset`
          : null)}
    />
  </div>
  {#if isEditing && onClearAll}
    <div class="flex justify-end px-6 pt-4">
      <Button
        text={m.admin__forms_common_clear_all()}
        color="light"
        style="ghost"
        size="sm"
        iconComponent={EraserIcon}
        onClick={onClearAll}
      />
    </div>
  {/if}
</section>
