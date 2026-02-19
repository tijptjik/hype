<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import Toggle from '$lib/components/forms/fields/Toggle.svelte'
// TYPES
import type { OrganisationForm } from '$lib/types'

// STATE : PROPS
let { form }: { form: OrganisationForm } = $props()

// STATE : CONTEXT :: FORM
let organisationForm: OrganisationForm['form'] = $derived(form.form)

// UTILS
const onChange = (e: Event): void => {
  e.preventDefault()
  organisationForm.update($form => {
    $form.isHubExclusive = !$form.isHubExclusive
    return $form
  })
}
</script>

<div class="flex flex-row items-center justify-between gap-4 align-baseline">
  <Toggle
    label={m.long_fit_vole_flow()}
    size="md"
    checked={$organisationForm.isHubExclusive as boolean}
    {onChange}
  />
</div>
