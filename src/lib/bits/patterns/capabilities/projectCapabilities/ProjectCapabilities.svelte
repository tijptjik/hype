<script lang="ts">
import { m } from '$lib/i18n'
import { SectionHeader, SectionHeaderPrimitive } from '$lib/bits/custom/form'
import { UserCapabilityMatrix } from '$lib/bits/patterns/capabilities/userCapabilityMatrix'
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
  ['bits-form__section', 'bits-project-capabilities', className]
    .filter(Boolean)
    .join(' '),
)
</script>

<section class={rootClass}>
  <SectionHeader
    {title}
    description={subtitle}
    class="bits-project-capabilities__header"
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

  <UserCapabilityMatrix
    title={matrixTitle}
    subtitle={matrixSubtitle}
    capabilityKeys={enabledCapabilityKeys}
    {capabilityLabelByKey}
    rows={matrixRows}
    {isEditing}
    {onToggleCell}
  />
</section>
