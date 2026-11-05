<script lang="ts">
import EditModeReveal from '#lib/bits/custom/form/EditModeReveal.svelte'
// ICONS
import Trash from 'virtual:icons/proicons/delete'
import { Button } from '#lib/bits/core/index.js'
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
    <Button
      text={removeMode ? m.moving_each_orangutan_care() : m.upper_caring_falcon_boost()}
      size="sm"
      style="ghost"
      color="light"
      iconClasses="size-5! [&_svg]:size-5!"
      iconComponent={Trash}
      attrs={{
        'aria-pressed': removeMode,
      }}
      onClick={event => toggleRemoveMode(event)}
      class="inline-flex min-h-10 items-center gap-2 px-3 [&_svg]:size-5"
    />
  </div>
</EditModeReveal>
