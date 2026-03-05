<script lang="ts">
import * as FormFieldsSectionPrimitive from './components'
import { SectionHeader, SectionHeaderPrimitive } from '$lib/bits/custom/form'
import type { FormFieldsSectionProps } from './formFieldsSection.types'

let {
  items,
  title,
  description,
  issues = [],
  actions,
  issueItemIds,
  isEditing = true,
  canEdit = isEditing,
  removeMode = false,
  onRemoveModeChange,
  card,
  class: className = '',
}: FormFieldsSectionProps = $props()

const rootClass = $derived(['bits-project-fields', className].filter(Boolean).join(' '))
const hasIssues = $derived(issues.length > 0)
</script>

<section class={rootClass}>
  <SectionHeader {title} description={description ?? ''}>
    {#if hasIssues}
      {#snippet center()}
        <SectionHeaderPrimitive.Issues {issues} />
      {/snippet}
    {/if}
    {#snippet right()}
      <div class="bits-form__section-header-actions">
        <FormFieldsSectionPrimitive.Actions
          {actions}
          {isEditing}
          {removeMode}
          {onRemoveModeChange}
          itemCount={items.length}
        />
      </div>
    {/snippet}
  </SectionHeader>

  <FormFieldsSectionPrimitive.Wrapper
    {items}
    {issueItemIds}
    {isEditing}
    {canEdit}
    {card}
    onAdd={event => actions.add(event)}
  />
</section>
