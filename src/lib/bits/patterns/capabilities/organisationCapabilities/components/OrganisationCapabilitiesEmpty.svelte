<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS COMPONENTS
import { Button } from '$lib/bits'

let { onEnterEditMode }: { onEnterEditMode: () => void } = $props()
</script>

<section class="bits-theme bits-form__section bits-form__capabilities-empty">
  <h3 class="bits-form__capabilities-empty-title">
    {m.admin__forms_capabilities_empty_title()}
  </h3>
  <p class="bits-form__capabilities-empty-description">
    {m.admin__forms_capabilities_empty_description()}
  </p>
  <Button
    text={m.admin__forms_capabilities_add()}
    color="primary"
    class="bits-form__capabilities-empty-cta"
    onClick={onEnterEditMode}
  />
</section>
