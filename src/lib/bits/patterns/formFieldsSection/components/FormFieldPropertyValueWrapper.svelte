<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// ICONS
import X from 'virtual:icons/lucide/x'
import ListPlus from 'virtual:icons/lucide/list-plus'
// COMPONENTS
import { Button } from '$lib/bits/core'
// TYPES
import type { Snippet } from 'svelte'

let {
  isEditing = false,
  optionRemoveMode = false,
  onAdd,
  onToggleRemoveMode,
  rows,
}: {
  isEditing?: boolean
  optionRemoveMode?: boolean
  onAdd: () => void
  onToggleRemoveMode: () => void
  rows?: Snippet
} = $props()
</script>

<section class="bits-project-field-card__values">
  <div class="bits-project-field-card__value-actions-shell">
    {#if isEditing}
      <div
        class="bits-project-field-card__value-actions-layer"
        transition:fade={{ duration: 180 }}
      >
        <div class="bits-project-field-card__value-actions">
          <Button
            text={m.wacky_home_sawfish_accept()}
            size="sm"
            style="ghost"
            color="light"
            iconComponent={ListPlus}
            disabled={optionRemoveMode}
            onClick={onAdd}
            class="bits-project-field-card__value-action-btn"
          />
          <Button
            text={optionRemoveMode ? m.cancel() : m.watery_trite_shrimp_clip()}
            size="sm"
            style="ghost"
            color="light"
            iconComponent={X}
            onClick={onToggleRemoveMode}
            class="bits-project-field-card__value-action-btn"
          />
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
