<script lang="ts">
import { fade } from 'svelte/transition'
// ICONS
import Trash from 'virtual:icons/proicons/delete'
import { Button, SimpleTooltip } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
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
    <SimpleTooltip contentProps={{ role: 'tooltip' }}>
      {#snippet trigger()}
        <Button
          text={removeMode
            ? m.moving_each_orangutan_care()
            : m.upper_caring_falcon_boost()}
          size="sm"
          style="ghost"
          color="light"
          iconClasses="size-5! [&_svg]:size-5!"
          iconComponent={Trash}
          attrs={{
            'aria-pressed': removeMode,
            title: removeMode
              ? m.moving_each_orangutan_care()
              : m.upper_caring_falcon_boost(),
          }}
          onClick={event => toggleRemoveMode(event)}
          class="min-h-10 inline-flex items-center gap-2 px-3 [&_svg]:size-5"
        />
      {/snippet}
      {removeMode ? m.moving_each_orangutan_care() : m.upper_caring_falcon_boost()}
    </SimpleTooltip>
  </div>
{/if}
