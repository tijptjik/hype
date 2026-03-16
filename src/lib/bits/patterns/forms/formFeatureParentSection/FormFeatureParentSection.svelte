<script lang="ts">
import { Button } from '$lib/bits/core'
import { m } from '$lib/i18n'
import {
  FormFeatureSectionHeader,
  FormFeatureSubSectionHeader,
} from '$lib/bits/patterns/forms/formFeatureSectionHeader'
import {
  FormParentLayerSection,
  FormParentOrganisationSection,
  FormParentProjectSection,
} from '$lib/bits/patterns/forms/formParentSection'
import EraserIcon from 'virtual:icons/lucide/eraser'
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
  class={['bits-form__section', 'bits-feature-parent-section', className].filter(Boolean).join(' ')}
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
          class="bits-feature-editor__collections-reset"
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

    <FormParentOrganisationSection
      title={m.resource__organisation_singular()}
      subHeader={subHeader ?? defaultSubHeader}
      {...sharedSectionProps}
      {...organisationSection}
    />
    <FormParentProjectSection
      title={m.resource__project_singular()}
      subHeader={subHeader ?? defaultSubHeader}
      {...sharedSectionProps}
      {...projectSection}
    />
    <FormParentLayerSection
      title={m.resource__layer_singular()}
      subHeader={subHeader ?? defaultSubHeader}
      {...sharedSectionProps}
      {...layerSection}
    />
  </div>
</section>
