<script lang="ts">
// ICONS
import ShieldIcon from 'virtual:icons/proicons/shield-checkmark'
// I18N
import { m } from '#lib/i18n.js'
import { SectionHeader, SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import { UserCapabilityMatrix } from '#lib/bits/patterns/capabilities/userCapabilityMatrix/index.js'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import * as ProjectCapabilitiesPrimitive from './components'
import type { ProjectCapabilitiesProps } from './projectCapabilities.types'

let {
  title = m.resources__capabilities(),
  subtitle = m.admin__forms_project_capabilities_subtitle(),
  capabilityIssues = [],
  class: className = '',
  availableCapabilityKeys,
  enabledCapabilityKeys,
  capabilityLabelByKey,
  matrixTitle = m.admin__forms_project_capability_matrix_title(),
  matrixSubtitle = m.admin__forms_project_capability_matrix_subtitle(),
  matrixRows,
  isEditing = false,
  onToggleCapability,
  onToggleCell,
}: ProjectCapabilitiesProps = $props()

const rootClass = $derived(
  [
    'grid min-w-0 flex-1',
    enabledCapabilityKeys.length > 0
      ? 'grid-rows-[repeat(2,minmax(min-content,1fr))]'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<div class={rootClass}>
  <section class="bits-form__section bits-project-capabilities">
    <SectionHeader
      icon={ShieldIcon}
      {title}
      description={subtitle}
      class="min-h-16 h-16 items-center pt-0 pb-0"
    />

    {#if capabilityIssues.length > 0}
      <SectionHeaderPrimitive.Issues issues={capabilityIssues} />
    {/if}

    <ProjectCapabilitiesPrimitive.List
      {availableCapabilityKeys}
      {enabledCapabilityKeys}
      {capabilityLabelByKey}
      {isEditing}
      {onToggleCapability}
    />
  </section>
  {#if enabledCapabilityKeys.length > 0}
    <div class={`min-w-0 ${formSectionDividerStyles}`}>
      <UserCapabilityMatrix
        title={matrixTitle}
        subtitle={matrixSubtitle}
        capabilityKeys={enabledCapabilityKeys}
        {capabilityLabelByKey}
        rows={matrixRows}
        {isEditing}
        {onToggleCell}
      />
    </div>
  {/if}
</div>
