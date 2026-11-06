<script lang="ts">
// ICONS
import RoutingIcon from 'virtual:icons/proicons/globe'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import FormInlineField from './FormInlineField.svelte'

type HubSpecifiersField = {
  as: (type: 'text') => Record<string, unknown>
  set: (value: string) => unknown
  issues: () => import('$app/server').RemoteFormIssue[] | undefined
}

type HubSpecifiersForm = {
  fields: {
    data: {
      code: HubSpecifiersField
      domain: HubSpecifiersField
      legalContactAddress: HubSpecifiersField
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
</script>

<section class="bits-form__section pb-0!">
  <SectionHeader
    title={m.admin__forms_hub_routing_title()}
    icon={RoutingIcon}
    description={m.admin__forms_hub_routing_subtitle()}
  />
  <div
    class="md:[&>section+section]:border-border/50 grid min-w-0 gap-6 px-6 pt-4 pb-6 md:grid-cols-3 md:[&>section+section]:border-l md:[&>section+section]:pl-6"
  >
    <FormInlineField
      label={m.admin__forms_hub_subdomain_label()}
      control={form.fields.data.code}
      required={isRequiredInPreflight(['data', 'code'])}
      {isEditing}
    />
    <FormInlineField
      label={m.admin__forms_hub_domain_label()}
      control={form.fields.data.domain}
      required={isRequiredInPreflight(['data', 'domain'])}
      {isEditing}
    />
    <FormInlineField
      label={m.admin__forms_hub_legal_contact_address_label()}
      control={form.fields.data.legalContactAddress}
      required={isRequiredInPreflight(['data', 'legalContactAddress'])}
      {isEditing}
    />
  </div>
</section>
