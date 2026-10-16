<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte'
import Form from '#lib/bits/custom/main/Form.svelte'
import { FormProfileSkeleton } from '#lib/bits/patterns/forms/formSkeleton'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles'
import FormI18nSection from '#lib/bits/patterns/forms/formI18nSection/FormI18nSection.svelte'
import FormUserRolesSection from '#lib/bits/patterns/forms/formUserRolesSection/FormUserRolesSection.svelte'
import FormSpecifiersFields from '#lib/bits/patterns/forms/formI18nSection/components/FormSpecifiersFields.svelte'
import { TextInput, TextArea } from '#lib/bits/custom/form'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import Type from 'virtual:icons/proicons/text'
import type { OrganisationRoleUser } from '#lib/db/zod/schema/organisation.types'
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
  user: { id: String(index), name },
})) as OrganisationRoleUser[]
const form = {
  fields: {
    data: {
      code: { as: () => ({ value: 'hkfoodworks' }), issues: () => undefined },
      url: {
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
          profileIcon={OrganisationIcon}
          membersIcon={OrganisationIcon}
          detailsIcon={Type}
          membersTitle="Members"
          membersSubtitle="Members can hold roles in projects"
        />
      {/snippet}
      <FormSurface>
        <FormI18nSection
          title="Profile"
          locales={[...locales]}
          isEditing={editing}
          localeCodeClass="absolute right-6 top-3 text-base font-medium uppercase text-muted-foreground"
        >
          {#snippet left()}
            <div class="flex items-center gap-3">
              <OrganisationIcon class="size-6 text-primary" />
              <h2 class="text-xl font-semibold tracking-tight">Profile</h2>
            </div>
          {/snippet}
          {#snippet children(
            locale,
          )}
            <TextInput label="Name" value="HKFoodWorks" {locale} isEditing={editing} />
            <TextInput
              label="Short Name"
              value="HKFoodWorks"
              {locale}
              isEditing={editing}
            />
            <TextArea
              label="Description"
              value="A registered charity dedicated to sustainable food futures."
              {locale}
              isEditing={editing}
            />
          {/snippet}
        </FormI18nSection>
        <div class={formSectionDividerStyles}>
          <FormUserRolesSection
            title="Members"
            subtitle="Members can hold roles in projects"
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
