<script lang="ts">
import { SectionHeader, TextInput } from '$lib/bits/custom/form'
import { m } from '$lib/i18n'
import FormSection from './FormSection.svelte'

type HubSpecifiersField = {
  as: (type: 'text') => Record<string, unknown>
  issues: () => string[]
}

type HubSpecifiersForm = {
  fields: {
    data: {
      code: HubSpecifiersField
      domain: HubSpecifiersField
    }
  }
}

let {
  form,
  isEditing = false,
  isRequiredInPreflight,
}: {
  form: HubSpecifiersForm
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
  <SectionHeader
    title={m.admin__forms_hub_routing_title()}
    description={m.admin__forms_hub_routing_subtitle()}
  />
  <FormSection>
    <TextInput
      label={m.admin__forms_hub_subdomain_label()}
      required={codeRequired}
      {isEditing}
      value={(codeInputAttrs as { value?: string }).value ?? ''}
      issues={codeIssues}
      inputAttrs={codeInputAttrs as Record<string, unknown>}
    />

    <TextInput
      label={m.admin__forms_hub_domain_label()}
      required={domainRequired}
      {isEditing}
      value={(domainInputAttrs as { value?: string }).value ?? ''}
      issues={domainIssues}
      inputAttrs={domainInputAttrs as Record<string, unknown>}
    />
  </FormSection>
</section>
