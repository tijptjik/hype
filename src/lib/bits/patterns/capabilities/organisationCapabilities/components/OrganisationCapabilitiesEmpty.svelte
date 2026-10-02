<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'

let {
  onEnterEditMode,
  disabled = false,
}: {
  onEnterEditMode: () => void
  disabled?: boolean
} = $props()
</script>

<section
  class="bits-theme bits-form__section bits-form__capabilities-empty flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 text-center min-h-64"
>
  <div class="flex w-full max-w-2xl flex-col items-center gap-3">
    <h3 class="bits-form__capabilities-empty-title text-2xl font-mono font-semibold">
      {m.admin__forms_capabilities_empty_title()}
    </h3>
    <p class="bits-form__capabilities-empty-description max-w-2xl">
      {m.admin__forms_capabilities_empty_description()}
    </p>
  </div>
  <Button
    text={m.admin__forms_capabilities_add()}
    color="primary"
    class="bits-form__capabilities-empty-cta mt-1"
    {disabled}
    onClick={onEnterEditMode}
  />
</section>
