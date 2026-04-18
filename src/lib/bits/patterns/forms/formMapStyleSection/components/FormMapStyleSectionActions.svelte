<script lang="ts">
import { Button } from '$lib/bits/core'
import { m } from '$lib/i18n'
import ReplaceIcon from 'virtual:icons/lucide/replace'
import XIcon from 'virtual:icons/lucide/x'

import type { FormMapStyleSectionActionsProps } from '../formMapStyleSection.types'

let {
  isAdding,
  isEditing = true,
  isSubmitting = false,
  onToggleAdding,
}: FormMapStyleSectionActionsProps = $props()
</script>

{#if isEditing}
  <div
    class="bits-form__section-header-actions inline-flex w-auto flex-row items-center justify-end gap-0"
  >
    <Button
      text={isAdding ? m.cancel() : m.replace()}
      style="ghost"
      color="light"
      size="sm"
      hideLabel={true}
      hideLabelInstantly={true}
      iconComponent={isAdding ? XIcon : ReplaceIcon}
      onClick={() => onToggleAdding()}
      disabled={!isEditing || isSubmitting}
      class="bits-form__parent-resource-replace-btn whitespace-nowrap h-10"
    />
  </div>
{/if}
