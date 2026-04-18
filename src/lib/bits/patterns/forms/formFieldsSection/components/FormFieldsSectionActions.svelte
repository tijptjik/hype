<script lang="ts">
import { fade } from 'svelte/transition'
// ICONS
import ListPlus from 'virtual:icons/lucide/list-plus'
import X from 'virtual:icons/lucide/x'
import { Button } from '$lib/bits/core'
import { m } from '$lib/i18n'
// TYPES
import type { FormFieldsSectionActionsProps } from '../formFieldsSection.types'

let {
  actions,
  isEditing = true,
  itemCount = 0,
  removeMode = false,
  onRemoveModeChange,
}: FormFieldsSectionActionsProps = $props()

const actionsVisible = $derived(itemCount > 0)

const toggleRemoveMode = (event: Event): void => {
  event.preventDefault()
  onRemoveModeChange?.(!removeMode)
}

$effect(() => {
  if (!removeMode) return
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') onRemoveModeChange?.(false)
  }
  window.addEventListener('keydown', onEscape)
  return () => window.removeEventListener('keydown', onEscape)
})
</script>

{#if isEditing}
  <div
    transition:fade={{ duration: 180 }}
    class={[
      'bits-project-fields__actions',
      actionsVisible ? 'bits-project-fields__actions--visible' : '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <Button
      text={m.fun_away_bird_peek()}
      size="sm"
      style="ghost"
      color="light"
      iconComponent={ListPlus}
      disabled={removeMode}
      onClick={event => actions.add(event)}
      class="bits-project-fields__action-btn"
    />
    <Button
      text={removeMode ? m.moving_each_orangutan_care() : m.upper_caring_falcon_boost()}
      size="sm"
      style="ghost"
      color="light"
      iconComponent={X}
      onClick={event => toggleRemoveMode(event)}
      class="bits-project-fields__action-btn"
    />
  </div>
{/if}
