<script lang="ts">
import { SectionHeader, TextInput } from '$lib/bits/custom/form'
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

const domainInputAttrs = $derived(form.fields.data.domain.as('text'))
const domainRequired = $derived(isRequiredInPreflight(['data', 'domain']))
const domainIssues = $derived(form.fields.data.domain.issues())
</script>

<section class="bits-form__section">
  <SectionHeader title="Specifiers" />
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
      label="Domain"
      required={domainRequired}
      {isEditing}
      value={(domainInputAttrs as { value?: string }).value ?? ''}
      issues={domainIssues}
      inputAttrs={domainInputAttrs as Record<string, unknown>}
    />
  </FormSection>
</section>
