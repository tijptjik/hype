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
import ReplaceIcon from 'virtual:icons/proicons/arrow-swap'
import XIcon from 'virtual:icons/proicons/cancel'
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

  <div class="flex flex-col items-center justify-center w-full min-w-0 text-center">
    {#if shouldShowTitle}
      <h3 class="bits-feature-sub-section-header__title">{title}</h3>
      {#if subtitle}
        <p class="bits-feature-sub-section-header__subtitle">{subtitle}</p>
      {/if}
    {/if}

    {#if issues.length > 0}
      <div transition:slide={{ duration: 180 }} class="w-full">
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
        class="min-h-8 px-2 self-center"
      />
    {/if}
  </div>
</div>
