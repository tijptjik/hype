<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// ICONS
import ArrowDownAZ from 'virtual:icons/proicons/arrow-sort'
import X from 'virtual:icons/proicons/cancel'
import ListPlus from 'virtual:icons/lucide/list-plus'
// COMPONENTS
import { Button } from '$lib/bits/core'
// TYPES
import type { Snippet } from 'svelte'

let {
  isEditing = false,
  optionRemoveMode = false,
  onAdd,
  onSort,
  onToggleRemoveMode,
  rows,
}: {
  isEditing?: boolean
  optionRemoveMode?: boolean
  onAdd: () => void
  onSort: () => void
  onToggleRemoveMode: () => void
  rows?: Snippet
} = $props()
let availableWidth = $state(0)
let labelledWidth = $state(0)
const hideLabels = $derived(labelledWidth > availableWidth)
</script>

{#snippet actions(compact: boolean, measuring = false)}
  <Button
    text={m.wacky_home_sawfish_accept()}
    hideLabel={compact}
    hideLabelInstantly
    size="sm"
    style="ghost"
    color="light"
    attrs={{
      'data-property-value-action': measuring ? undefined : 'add',
      title: m.wacky_home_sawfish_accept(),
    }}
    iconComponent={ListPlus}
    disabled={optionRemoveMode}
    onClick={onAdd}
    class="bits-project-field-card__value-action-btn"
  />
  <Button
    text={m.admin__forms_property_sort_az()}
    hideLabel={compact}
    hideLabelInstantly
    size="sm"
    style="ghost"
    color="light"
    attrs={{
      'data-property-value-action': measuring ? undefined : 'sort',
      title: m.admin__forms_property_sort_az(),
    }}
    iconComponent={ArrowDownAZ}
    disabled={optionRemoveMode}
    onClick={onSort}
    class="bits-project-field-card__value-action-btn"
  />
  <Button
    text={optionRemoveMode ? m.cancel() : m.watery_trite_shrimp_clip()}
    hideLabel={compact}
    hideLabelInstantly
    size="sm"
    style="ghost"
    color="light"
    attrs={{
      'data-property-value-action': measuring ? undefined : 'remove-toggle',
      title: optionRemoveMode ? m.cancel() : m.watery_trite_shrimp_clip(),
    }}
    iconComponent={X}
    onClick={onToggleRemoveMode}
    class="bits-project-field-card__value-action-btn"
  />
{/snippet}

<section class="bits-project-field-card__values">
  <div class="relative min-h-8.5">
    {#if isEditing}
      <div
        class="bits-project-field-card__value-actions-layer"
        transition:fade={{ duration: 180 }}
      >
        <!-- Measure the full labels independently so compact mode cannot oscillate. -->
        <div
          class="invisible pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
          inert
        >
          <div class="flex w-max items-center gap-2" bind:clientWidth={labelledWidth}>
            {@render actions(false, true)}
          </div>
        </div>
        <div
          class="flex min-h-full items-center justify-center gap-2"
          bind:clientWidth={availableWidth}
        >
          {@render actions(hideLabels)}
        </div>
      </div>
    {:else}
      <div
        class="bits-project-field-card__value-actions-layer"
        transition:fade={{ duration: 180 }}
      >
        <div class="bits-project-field-card__value-actions-label">
          {m.admin__forms_property_options()}
        </div>
      </div>
    {/if}
  </div>

  {@render rows?.()}
</section>
