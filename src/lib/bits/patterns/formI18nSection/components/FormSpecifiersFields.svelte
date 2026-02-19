<script lang="ts">
import { m } from '$lib/i18n'
import { TextInput, SectionHeader } from '$lib/bits/custom/form'
import FormSection from './FormSection.svelte'

let {
  form,
  isEditing = false,
  isRequiredInPreflight,
}: {
  form: any
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
} = $props()

const codeInputAttrs = $derived(form.fields.data.code.as('text'))
const codeRequired = $derived(isRequiredInPreflight(['data', 'code']))
const codeIssues = $derived(form.fields.data.code.issues())

const urlInputAttrs = $derived(form.fields.data.url.as('url'))
const urlRequired = $derived(isRequiredInPreflight(['data', 'url']))
const urlIssues = $derived(form.fields.data.url.issues())
</script>

<section class="bits-form__section">
  <SectionHeader title={m.admin__forms_common_specifiers()} />
  <FormSection>
    <TextInput
      label="Code"
      required={codeRequired}
      {isEditing}
      value={(codeInputAttrs as { value?: string }).value ?? ''}
      issues={codeIssues}
      inputAttrs={codeInputAttrs as Record<string, unknown>}
    />

    <TextInput
      label="Url"
      required={urlRequired}
      {isEditing}
      value={(urlInputAttrs as { value?: string }).value ?? ''}
      issues={urlIssues}
      inputAttrs={urlInputAttrs as Record<string, unknown>}
    />
  </FormSection>
</section>
