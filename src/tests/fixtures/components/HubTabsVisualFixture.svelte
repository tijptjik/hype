<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
import FormHubLayersSection from '#lib/bits/patterns/forms/formHubLayersSection/FormHubLayersSection.svelte'
import FormHubSpecifiersFields from '#lib/bits/patterns/forms/formI18nSection/components/FormHubSpecifiersFields.svelte'
import FormHubSubscriptionSection from '#lib/bits/patterns/forms/formI18nSection/components/FormHubSubscriptionSection.svelte'
import FormI18nSection from '#lib/bits/patterns/forms/formI18nSection/FormI18nSection.svelte'
import FormPolicyField from '#lib/bits/patterns/forms/formPolicyField/FormPolicyField.svelte'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import OrganisationTabsVisualFixture from './OrganisationTabsVisualFixture.svelte'
// TYPES
import { HubSubscriptionService } from '#lib/enums.js'

setResponsiveCtx()
let { tab = 'core', editing = false }: { tab?: string; editing?: boolean } = $props()
let available = $state(true)
let layerItems = $state([
  {
    id: 'one',
    organisationId: 'a',
    organisationName: 'Community Food Network',
    projectNameShort: 'Breadline',
    layerName: 'Food collection locations',
    isDefaultVisible: true,
  },
  {
    id: 'two',
    organisationId: 'a',
    organisationName: 'Community Food Network',
    projectNameShort: 'Breadline',
    layerName: 'Volunteer meeting points',
    isDefaultVisible: false,
  },
  {
    id: 'three',
    organisationId: 'b',
    organisationName: 'Neighbourhood partners',
    projectNameShort: 'Community',
    layerName: 'Community kitchens',
    isDefaultVisible: true,
  },
])
const locales = ['en', 'zhHant', 'zhHans'] as const
const field = {
  as: (type: string, value?: string) => ({ type, value: value ?? 'Community hub' }),
  issues: () => [],
}
const form = {
  fields: {
    value: () => ({ data: { i18n: {} } }),
    data: {
      code: field,
      domain: field,
      legalContactAddress: field,
      isSubscriptionAvailable: field,
      subscriptionService: field,
      subscriptionId: field,
      subscriptionSessionCookie: field,
      subscriptionPlacement: { hubPanel: field, topBar: field, menu: field },
      i18n: Object.fromEntries(
        locales.map(locale => [
          locale,
          { subscriptionBenefits: field, subscriptionBenefitsGen: field },
        ]),
      ),
    },
  },
}
let fieldsFixture: OrganisationTabsVisualFixture | undefined = $state()
$effect(() => {
  fieldsFixture?.setView('fields', editing)
})
</script>

<div class="bits-theme min-h-screen bg-canvas text-foreground">
  <main class="bits-admin-shell__main">
    {#if tab === 'fields'}
      <OrganisationTabsVisualFixture bind:this={fieldsFixture} />
    {:else}
      <FormSurface class={resourceTabsStyles}>
        {#if tab === 'layers'}
          <FormHubLayersSection
            title="Layers"
            subtitle="Choose which layers are visible by default in this hub."
            localeKey="en"
            items={layerItems}
            isEditing={editing}
            onToggleDefault={(id, value) => {
              layerItems = layerItems.map(item =>
                item.id === id ? { ...item, isDefaultVisible: value } : item,
              )
            }}
          />
        {:else if tab === 'policies'}
          <FormI18nSection
            title="Policies"
            subtitle="Configure the privacy policy and terms of service shown for this hub."
            locales={[...locales]}
            isEditing={editing}
            sectionKey="policies"
          >
            {#snippet children(
              locale,
            )}
              <FormPolicyField
                label="Privacy Policy"
                {locale}
                isEditing={editing}
                rows={24}
                value={'# Privacy policy\n\nWe **respect your privacy**.\n\n## Information we collect\n\n- Account details\n- Community contributions'}
              />
              <FormPolicyField
                label="Terms Of Service"
                {locale}
                isEditing={editing}
                rows={20}
                value={'# Terms of service\n\nWelcome to our **community hub**.\n\nPlease use these services respectfully.'}
              />
            {/snippet}
          </FormI18nSection>
        {:else if tab === 'images'}
          <SectionHeader title="Profile Image" />
          <div class="p-6 text-muted-foreground">
            Save this hub before adding images.
          </div>
        {:else}
          <FormHubSpecifiersFields
            form={form as never}
            isEditing={editing}
            isRequiredInPreflight={() => false}
          />
          <div class={formSectionDividerStyles}>
            <FormHubSubscriptionSection
              form={form as never}
              isEditing={editing}
              isSubscriptionAvailable={available}
              subscriptionService={HubSubscriptionService.substack}
              subscriptionId="community"
              subscriptionBenefitsByLocale={{
                en: 'Community news and opportunities',
                zhHant: '社區消息',
                zhHans: '社区消息',
              }}
              subscriptionPlacement={{ topBar: true, hubPanel: true, menu: false }}
              onAvailabilityChange={value => {
                available = value
              }}
            />
          </div>
        {/if}
      </FormSurface>
    {/if}
  </main>
</div>
