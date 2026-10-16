<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte'
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
import OrganisationCapabilities from '#lib/bits/patterns/capabilities/organisationCapabilities/OrganisationCapabilities.svelte'
import FormFieldsSection from '#lib/bits/patterns/forms/formFieldsSection/FormFieldsSection.svelte'
import { SectionHeader } from '#lib/bits/custom/form'
import ImageIcon from 'virtual:icons/proicons/photo'
import type { Property } from '#lib/db/zod/schema/property.types'
import Type from 'virtual:icons/proicons/text'
setResponsiveCtx()
let editing = $state(false)
let tab = $state('capabilities')
export function setView(next: string, edit: boolean) {
  tab = next
  editing = edit
}
const locales = ['en', 'zhHant', 'zhHans'] as const
const fields = {
  manageVolunteers: {
    i18n: Object.fromEntries(
      locales.map(locale => [
        locale,
        { as: () => ({ value: 'Check in' }), issues: () => [] },
      ]),
    ),
  },
}
const noop = () => {}
const property = {
  id: 'field',
  rank: 0,
  type: 'specifier',
  scope: 'organisation',
  key: 'notes',
  component: 'TextInput',
  isDefaultEnabled: true,
  isTranslatable: true,
  i18n: {
    en: { label: 'Notes' },
    zhHant: { label: 'Notes' },
    zhHans: { label: 'Notes' },
  },
  values: [],
} as unknown as Property
const fieldProxy: object = new Proxy(
  {},
  {
    get: (_, key) =>
      key === 'as'
        ? (type: string, value: unknown) => ({ type, value })
        : key === 'issues'
          ? () => []
          : fieldProxy,
  },
)
const callbacks = {
  onIncreaseRank: noop,
  onDecreaseRank: noop,
  onRemove: noop,
  onUpdateBase: noop,
  onUpdateI18n: noop,
  onAddValue: noop,
  onRemoveValue: noop,
  onMoveValue: noop,
  onUpdateValue: noop,
  onUpdateValueI18n: noop,
  onTranslateLocale: async () => {},
  onResetLocale: noop,
}
</script>
<div class="bits-theme">
  <main class="bits-admin-shell__main">
    <FormSurface class={resourceTabsStyles}>
      {#if tab === 'capabilities'}
        <OrganisationCapabilities
          selectedCapabilityKeys={['manageVolunteers']}
          capabilitySearchOptions={[]}
          selectedCapabilityIds={['manageVolunteers']}
          currentLocaleKey="en"
          locales={[...locales]}
          isEditing={editing}
          capabilityLabelsByKey={{}}
          formCapabilityFields={fields}
          isRequiredInPreflight={() => false}
          getCapabilityDisplayLabel={() => 'Check in'}
          onAddCapability={noop}
          onRemoveCapability={noop}
          onEnterEditMode={noop}
        />
      {:else if tab === 'fields'}
        <FormFieldsSection
          items={[property]}
          card={{
            ...callbacks,
            locales: [...locales],
            classifierComponents: [],
            specifierComponents: ['TextInput'],
            isRequiredInPreflight: () => false,
            removeMode: false,
            isEditing: editing,
            getPropertyIndex: () => 0,
            getPropertyFields: () => fieldProxy,
          }}
          title="Fields"
          description="Configure the fields available to projects"
          icon={Type}
          keepHeader
          isEditing={editing}
          actions={{ add: noop, remove: noop, increaseRank: noop, decreaseRank: noop }}
        />
      {:else}
        <SectionHeader icon={ImageIcon} title="Profile Image" />
        <div class="p-6"><div class="h-80 rounded-xl bg-foreground/5"></div></div>
      {/if}
    </FormSurface>
  </main>
</div>
