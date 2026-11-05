<script lang="ts">
import EditModeReveal from '#lib/bits/custom/form/EditModeReveal.svelte'
// ICONS
import Trash from 'virtual:icons/proicons/delete'
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

<EditModeReveal visible={isEditing}>
  <div
    class={[
      'bits-project-fields__actions',
      actionsVisible ? 'bits-project-fields__actions--visible' : '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <button
      type="button"
      aria-label={removeMode
        ? m.moving_each_orangutan_care()
        : m.upper_caring_falcon_boost()}
      title={removeMode
        ? m.moving_each_orangutan_care()
        : m.upper_caring_falcon_boost()}
      aria-pressed={removeMode}
      onclick={toggleRemoveMode}
      class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline-2 disabled:opacity-50"
    >
      <Trash class="size-4" />
      <span data-control-label
        >{removeMode
          ? m.moving_each_orangutan_care()
          : m.upper_caring_falcon_boost()}</span
      >
    </button>
  </div>
</EditModeReveal>
