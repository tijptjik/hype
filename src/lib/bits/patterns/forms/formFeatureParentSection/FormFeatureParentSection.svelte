<script lang="ts">
import { Button } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
import {
  FormFeatureSectionHeader,
  FormFeatureSubSectionHeader,
} from '#lib/bits/patterns/forms/formFeatureSectionHeader/index.js'
import { FormParentSection } from '#lib/bits/patterns/forms/formParentSection/index.js'
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
  <FormFeatureSectionHeader
    title={m.admin__forms_feature_collections_title()}
    subtitle={m.admin__forms_feature_collections_subtitle()}
  >
    {#snippet right()}
      {#if isEditing}
        <Button
          text={m.admin__forms_common_clear_all()}
          color="light"
          style="ghost"
          size="sm"
          iconComponent={EraserIcon}
          class="flex-none"
          onClick={onClearAll}
        />
      {/if}
    {/snippet}
  </FormFeatureSectionHeader>

  <div class="bits-feature-parent-section__grid">
    {#snippet defaultSubHeader({
      title,
      subtitle,
      issues,
      isEditing,
      isSearchActive,
      isSubmitting,
      isResultsVisible,
      onToggleAdding,
    })}
      <FormFeatureSubSectionHeader
        {title}
        {subtitle}
        {issues}
        {isEditing}
        {isSearchActive}
        {isSubmitting}
        {isResultsVisible}
        {onToggleAdding}
      />
    {/snippet}

    <FormParentSection
      title={m.resource__organisation_singular()}
      subHeader={subHeader ?? defaultSubHeader}
      {...sharedSectionProps}
      {...organisationSection}
    />
    <FormParentSection
      title={m.resource__project_singular()}
      subHeader={subHeader ?? defaultSubHeader}
      {...sharedSectionProps}
      {...projectSection}
    />
    <FormParentSection
      title={m.resource__layer_singular()}
      subHeader={subHeader ?? defaultSubHeader}
      {...sharedSectionProps}
      {...layerSection}
    />
  </div>
</section>
