<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'

let {
  onEnterEditMode,
  disabled = false,
}: {
  onEnterEditMode: () => void
  disabled?: boolean
} = $props()
</script>

<section
  class="bits-theme bits-form__section bits-form__capabilities-empty bits-form__empty-state"
>
  <div class="bits-form__empty-state-copy">
    <h3 class="bits-form__capabilities-empty-title bits-form__empty-state-title">
      {m.admin__forms_capabilities_empty_title()}
    </h3>
    <p
      class="bits-form__capabilities-empty-description bits-form__empty-state-description"
    >
      {m.admin__forms_capabilities_empty_description()}
    </p>
  </div>
  <Button
    text={m.admin__forms_capabilities_add()}
    color="primary"
    class="bits-form__capabilities-empty-cta bits-form__empty-state-cta"
    {disabled}
    onClick={onEnterEditMode}
  />
</section>
