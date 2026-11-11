<script lang="ts">
// COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import FormFieldSkeleton from './FormFieldSkeleton.svelte'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import RoutingIcon from 'virtual:icons/proicons/globe'
</script>
<section class="bits-form__section pb-0!" aria-hidden="true">
  <SectionHeader
    title={m.admin__forms_hub_routing_title()}
    icon={RoutingIcon}
    description={m.admin__forms_hub_routing_subtitle()}
  />
  <div
    class="md:[&>section+section]:border-border/50 grid min-w-0 gap-6 px-6 pt-4 pb-6 md:grid-cols-3 md:[&>section+section]:border-l md:[&>section+section]:pl-6"
  >
    {#each [
      m.admin__forms_hub_subdomain_label(),
      m.admin__forms_hub_domain_label(),
      m.admin__forms_hub_legal_contact_address_label(),
    ] as label}
      <FormFieldSkeleton {label} readOnly />
    {/each}
  </div>
</section>
