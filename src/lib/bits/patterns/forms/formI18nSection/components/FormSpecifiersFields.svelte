<script lang="ts">
import { m } from '$lib/i18n'
import { TextInput, SectionHeader } from '$lib/bits/custom/form'
import FormSection from './FormSection.svelte'

let {
  form,
  isEditing = false,
  isRequiredInPreflight,
  fields = ['code', 'url'],
}: {
  form: any
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  fields?: Array<'code' | 'url'>
} = $props()

const showCode = $derived(fields.includes('code'))
const showUrl = $derived(fields.includes('url') && Boolean(form.fields.data?.url))

const codeInputAttrs = $derived(form.fields.data.code.as('text'))
const codeRequired = $derived(isRequiredInPreflight(['data', 'code']))
const codeIssues = $derived(form.fields.data.code.issues())

const urlInputAttrs = $derived(
  showUrl ? form.fields.data.url.as('url') : ({} as Record<string, unknown>),
)
const urlRequired = $derived(showUrl ? isRequiredInPreflight(['data', 'url']) : false)
const urlIssues = $derived(showUrl ? form.fields.data.url.issues() : undefined)
</script>

<section class="bits-form__section">
  <SectionHeader title={m.admin__forms_common_specifiers()} />
  <FormSection>
    {#if showCode}
      <TextInput
        label="Code"
        required={codeRequired}
        {isEditing}
        value={(codeInputAttrs as { value?: string }).value ?? ''}
        issues={codeIssues}
        inputAttrs={codeInputAttrs as Record<string, unknown>}
      />
    {/if}

    {#if showUrl}
      <TextInput
        label="Url"
        required={urlRequired}
        {isEditing}
        value={(urlInputAttrs as { value?: string }).value ?? ''}
        issues={urlIssues}
        inputAttrs={urlInputAttrs as Record<string, unknown>}
      />
    {/if}
  </FormSection>
</section>
