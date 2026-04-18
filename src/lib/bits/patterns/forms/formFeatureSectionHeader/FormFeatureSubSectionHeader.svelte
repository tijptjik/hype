<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CORE
import { Button } from '$lib/bits/core'
// CUSTOM
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
// ICONS
import ReplaceIcon from 'virtual:icons/lucide/replace'
import XIcon from 'virtual:icons/lucide/x'
// TYPES
import type { FormFeatureSubSectionHeaderProps } from './formFeatureSectionHeader.types'

let {
  title,
  subtitle = '',
  issues = [] as string[],
  class: className = '',
  left,
  right,
  isEditing = false,
  isSearchActive = false,
  isSubmitting = false,
  isResultsVisible = false,
  onToggleAdding,
}: FormFeatureSubSectionHeaderProps = $props()

const rootClass = $derived(
  ['bits-feature-sub-section-header', className].filter(Boolean).join(' '),
)
const shouldShowTitle = $derived(issues.length === 0)
const canShowAction = $derived(isEditing)
const actionLabel = $derived(isSearchActive ? m.cancel() : m.replace())
const actionIcon = $derived(isSearchActive ? XIcon : ReplaceIcon)
const isActionDisabled = $derived(isSubmitting || (isSearchActive && !isResultsVisible))

function handleToggleAdding(): void {
  onToggleAdding?.()
}
</script>

<div class={rootClass}>
  <div
    class="bits-feature-sub-section-header__rail bits-feature-sub-section-header__rail--left"
  >
    {#if left}
      {@render left()}
    {/if}
  </div>

  <div class="bits-feature-sub-section-header__content">
    {#if shouldShowTitle}
      <h3 class="bits-feature-sub-section-header__title">{title}</h3>
      {#if subtitle}
        <p class="bits-feature-sub-section-header__subtitle">{subtitle}</p>
      {/if}
    {/if}

    {#if issues.length > 0}
      <div
        transition:slide={{ duration: 180 }}
        class="bits-feature-sub-section-header__issues"
      >
        <SectionHeaderPrimitive.Issues {issues} />
      </div>
    {/if}
  </div>

  <div
    class="bits-feature-sub-section-header__rail bits-feature-sub-section-header__rail--right"
  >
    {#if right}
      {@render right()}
    {:else if canShowAction}
      <Button
        text={actionLabel}
        style="ghost"
        color="light"
        size="sm"
        hideLabel={true}
        hideLabelInstantly={true}
        iconComponent={actionIcon}
        onClick={handleToggleAdding}
        disabled={isActionDisabled}
        class="bits-feature-sub-section-header__action-btn"
      />
    {/if}
  </div>
</div>
