<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import Form from '#lib/bits/custom/main/Form.svelte'
import { FormProfileSkeleton } from '#lib/bits/patterns/forms/formSkeleton/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import FormI18nDescriptorProfile from '#lib/bits/patterns/forms/formI18nSection/FormI18nDescriptorProfile.svelte'
import FormUserRolesSection from '#lib/bits/patterns/forms/formUserRolesSection/FormUserRolesSection.svelte'
import FormSpecifiersFields from '#lib/bits/patterns/forms/formI18nSection/components/FormSpecifiersFields.svelte'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import Type from 'virtual:icons/proicons/text'
import type { OrganisationRoleUser } from '#lib/db/zod/schema/organisation.types.js'
let { ready = false }: { ready?: boolean } = $props()
setResponsiveCtx()
let localReady = $state(false)
let editing = $state(false)
export function resolve() {
  localReady = true
}
export function reload() {
  localReady = false
}
export function edit() {
  editing = true
}
const locales = ['en', 'zhHant', 'zhHans'] as const
const users = ['Alex Chan', 'Robin Lee', 'Sam Wong'].map((name, index) => ({
  userId: String(index),
  role: 'owner',
  user: { id: String(index), name, username: `user${index}` },
})) as OrganisationRoleUser[]
const descriptorValues = {
  i18n: {
    en: {
      name: 'HKFoodWorks',
      nameShort: 'HKFoodWorks',
      description: 'A registered charity dedicated to sustainable food futures.',
    },
  },
}
const descriptorFields = new Proxy(
  {},
  {
    get: (_target, locale: string) =>
      new Proxy(
        {},
        {
          get: (_row, key: string) => ({
            as: (type: string) => ({
              type,
              value: descriptorValues.i18n[locale as 'en']?.[key as 'name'] ?? '',
            }),
            set: () => {},
            issues: () => undefined,
          }),
        },
      ),
  },
)
const form = {
  fields: {
    value: () => ({ data: descriptorValues }),
    set: () => {},
    data: {
      code: {
        set: () => {},
        as: () => ({ value: 'hkfoodworks' }),
        issues: () => undefined,
      },
      url: {
        set: () => {},
        as: () => ({ value: 'https://hkfoodworks.com/' }),
        issues: () => undefined,
      },
    },
  },
}
</script>

<div class="bits-theme">
  <main class="bits-admin-shell__main">
    <Form isReady={ready || localReady}>
      {#snippet fallback()}
        <FormProfileSkeleton
          locales={[...locales]}
          membersIcon={OrganisationIcon}
          detailsIcon={Type}
          membersTitle="Staff"
          membersSubtitle="Owners and members manage this organisation."
        />
      {/snippet}
      <FormSurface>
        <FormI18nDescriptorProfile
          {form}
          fields={descriptorFields}
          defaultLocales={[...locales]}
          recordKey="fixture"
          isEditing={editing}
          isRequiredInPreflight={() => false}
          stickyFieldHeaders={['description']}
          showPrimaryLocaleHeader={false}
          localeHeaderPlacement="gutter"
          translate={async () => ({ status: 'translated', text: '' })}
          onChange={() => {}}
        />
        <div class={formSectionDividerStyles}>
          <FormUserRolesSection
            title="Staff"
            subtitle="Owners and members manage this organisation."
            icon={OrganisationIcon}
            userRoles={users}
            currentUserId="0"
            isEditing={editing}
            layout="list"
            onAddUser={() => {}}
            onRemoveUser={() => {}}
            onRoleChange={() => {}}
          />
        </div>
        <div class={formSectionDividerStyles}>
          <FormSpecifiersFields
            {form}
            title="Details"
            icon={Type}
            isEditing={editing}
            isRequiredInPreflight={() => false}
          />
        </div>
      </FormSurface>
    </Form>
  </main>
</div>
