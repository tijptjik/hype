<script lang="ts">
// SVELTE
import { cubicInOut } from 'svelte/easing'
import { slide } from 'svelte/transition'
// COMPONENTS
import FormFieldCardHeader from './FormFieldCardHeader.svelte'
import FormFieldCardBody from './FormFieldCardBody.svelte'
// TYPES
import type { FormFieldCardProps } from '../formFieldsSection.types'

let {
  property,
  propertyIndex,
  sectionRank,
  propertyFields,
  totalItems,
  removeMode,
  locales,
  classifierComponents,
  specifierComponents,
  isRequiredInPreflight,
  isEditing = true,
  onIncreaseRank,
  onDecreaseRank,
  onRemove,
  onUpdateBase,
  onUpdateI18n,
  onAddValue,
  onRemoveValue,
  onMoveValue,
  onUpdateValueI18n,
  onTranslateLocale,
  onResetLocale,
}: FormFieldCardProps = $props()

let collapsed = $state(false)
</script>

<article class="bits-project-field-card">
  <FormFieldCardHeader
    {property}
    {totalItems}
    {isEditing}
    {removeMode}
    {collapsed}
    {onIncreaseRank}
    {onDecreaseRank}
    {onRemove}
    onToggleCollapse={() => (collapsed = !collapsed)}
    onToggleIsTranslatable={(propertyId, value) =>
      onUpdateBase(propertyId, 'isTranslatable', value)}
  />

  {#snippet cardBodyContent()}
    <div class="bits-project-field-card__body-inner">
      <FormFieldCardBody
        {property}
        {propertyIndex}
        {sectionRank}
        {propertyFields}
        {locales}
        {classifierComponents}
        {specifierComponents}
        {isRequiredInPreflight}
        {isEditing}
        {onUpdateBase}
        {onUpdateI18n}
        {onAddValue}
        {onRemoveValue}
        {onMoveValue}
        {removeMode}
        {onUpdateValueI18n}
        {onTranslateLocale}
        {onResetLocale}
      />
    </div>
  {/snippet}

  <!--
    We keep two branches on purpose:
    - visible branch uses Svelte's `slide` transition for expand/collapse
    - hidden branch preserves a non-visible DOM fallback instead of removing the section entirely
  -->
  {#if !collapsed}
    <div
      class="bits-project-field-card__body"
      in:slide={{ duration: 240, easing: cubicInOut }}
      out:slide={{ duration: 220, easing: cubicInOut }}
    >
      {@render cardBodyContent()}
    </div>
  {:else}
    <div
      class="bits-project-field-card__body bits-project-field-card__body--hidden"
      aria-hidden
    >
      {@render cardBodyContent()}
    </div>
  {/if}
</article>
