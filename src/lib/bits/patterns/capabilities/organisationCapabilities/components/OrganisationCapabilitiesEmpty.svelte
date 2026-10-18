<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import EmptyState from '#lib/bits/custom/emptyState/EmptyState.svelte'

let {
  onEnterEditMode,
  disabled = false,
}: {
  onEnterEditMode: () => void
  disabled?: boolean
} = $props()
</script>

<EmptyState
  title={m.admin__forms_capabilities_empty_title()}
  description={m.admin__forms_capabilities_empty_description()}
  class="bits-theme bits-form__section bits-form__capabilities-empty"
  titleClass="bits-form__capabilities-empty-title"
  descriptionClass="bits-form__capabilities-empty-description"
>
  {#snippet actions()}
    <Button
      text={m.admin__forms_capabilities_add()}
      color="primary"
      class="bits-form__capabilities-empty-cta"
      {disabled}
      onClick={onEnterEditMode}
    />
  {/snippet}
</EmptyState>
