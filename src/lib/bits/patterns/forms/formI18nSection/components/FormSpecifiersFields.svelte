<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import FormInlineField from './FormInlineField.svelte'

type FormFieldControl = {
  as: (type: 'text' | 'url') => Record<string, unknown>
  set: (value: string) => unknown
  issues: () => import('$app/server').RemoteFormIssue[] | undefined
}

type SpecifiersForm = {
  fields: {
    data: {
      code: FormFieldControl
      url?: FormFieldControl
    }
  }
}

let {
  form,
  icon,
  isEditing = false,
  isRequiredInPreflight,
  fields = ['code', 'url'],
  title = m.admin__forms_common_specifiers(),
}: {
  icon?: Component
  form: SpecifiersForm
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
  fields?: Array<'code' | 'url'>
  title?: string
} = $props()

const showCode = $derived(fields.includes('code'))
const showUrl = $derived(fields.includes('url') && Boolean(form.fields.data?.url))
</script>

<section class="bits-form__section">
  <SectionHeader {title} {icon} />
  <div
    class="md:[&>section+section]:border-border/50 grid min-w-0 gap-6 px-6 py-6 md:grid-cols-2 md:[&>section+section]:border-l md:[&>section+section]:pl-6"
  >
    {#if showCode}
      <FormInlineField
        label="Code"
        control={form.fields.data.code}
        required={isRequiredInPreflight(['data', 'code'])}
        {isEditing}
      />
    {/if}
    {#if showUrl && form.fields.data.url}
      <FormInlineField
        label="Url"
        control={form.fields.data.url}
        required={isRequiredInPreflight(['data', 'url'])}
        {isEditing}
      />
    {/if}
  </div>
</section>
