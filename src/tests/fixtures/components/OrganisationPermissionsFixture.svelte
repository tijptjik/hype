<!-- biome-ignore-all lint/a11y/noHeaderScope: scope is a Svelte component prop, not a table attribute. -->
<script lang="ts">
// COMPONENTS
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import OrganisationPermissions from '#lib/bits/patterns/organisationUsers/OrganisationPermissions.svelte'
import MultilingualDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/MultilingualDefaults.svelte'
// I18N
import { m } from '#lib/i18n.js'

let permitted = $state(false)
let canManage = $state(true)
let editing = $state(true)
</script>

<main class="bits-theme bg-background text-foreground min-h-screen">
  <FormSurface>
    <div class="flex flex-col gap-4 pb-6">
      <SectionHeader title={m.project_advanced()} />
      <section class="mx-6">
        <h2 class="mb-3 text-base font-semibold">Languages</h2>
        <MultilingualDefaults
          scope="organisation"
          value={{}}
          disabled
          onChange={() => {}}
        />
      </section>
      <SectionHeader title={m.organisation_permissions_heading()} />
      <div class="mx-6">
        <OrganisationPermissions
          {permitted}
          {canManage}
          disabled={!editing}
          onChange={value => (permitted = value)}
        />
      </div>
      <div class="mx-6 flex flex-wrap gap-4 text-sm">
        <button type="button" onclick={() => (canManage = !canManage)}>
          Switch actor
        </button>
        <button type="button" onclick={() => (editing = !editing)}>
          Toggle editing
        </button>
        <button type="button" onclick={() => (permitted = false)}>Reset</button>
        <output data-permission-state
          >{JSON.stringify({ permitted, canManage, editing })}</output
        >
      </div>
    </div>
  </FormSurface>
</main>
