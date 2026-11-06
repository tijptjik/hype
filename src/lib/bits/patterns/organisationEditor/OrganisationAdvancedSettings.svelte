<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import ContentLocaleDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/ContentLocaleDefaults.svelte'
import MultilingualDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/MultilingualDefaults.svelte'
import LocationVisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'
import OrganisationPermissions from '#lib/bits/patterns/organisationUsers/OrganisationPermissions.svelte'
// ICONS
import LanguagesIcon from 'virtual:icons/lucide/languages'
import VisibilityIcon from 'virtual:icons/lucide/eye'
import ShieldIcon from 'virtual:icons/proicons/shield-checkmark'
// TYPES
import type { ComponentProps } from 'svelte'
import type { OrganisationSettingsPatch } from '#lib/organisations/settings.js'
import type { MultilingualSettingKey } from '#lib/content-locales/settings.js'

let {
  name,
  settings,
  inheritedLocales,
  options,
  disabled,
  issues,
  visibility,
  visibilityAttrs,
  onVisibilityChange,
  permitted,
  permissionAttrs,
  canManagePermissions,
  onPermissionChange,
  onContentLocalesChange,
  onMultilingualDefaultsChange,
}: {
  name: string
  settings: OrganisationSettingsPatch
  inheritedLocales: string[]
  options: ComponentProps<typeof ContentLocaleDefaults>['options']
  disabled: boolean
  issues: readonly string[]
  visibility: ComponentProps<typeof LocationVisibilitySelect>['value']
  visibilityAttrs: Record<string, unknown>
  onVisibilityChange: ComponentProps<typeof LocationVisibilitySelect>['onChange']
  permitted: boolean
  permissionAttrs?: Record<string, unknown>
  canManagePermissions: boolean
  onPermissionChange: (value: boolean) => void
  onContentLocalesChange: (value: string[] | undefined) => void
  onMultilingualDefaultsChange: (
    patch: Partial<Record<MultilingualSettingKey, boolean | null>>,
  ) => void
} = $props()
</script>

<FormSurface>
  <section class="flex min-h-0 flex-col gap-4 pb-6">
    <div class="grid min-w-0 gap-y-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section class="flex min-w-0 flex-col gap-4">
        <SectionHeader title={m.content_languages_heading()} icon={LanguagesIcon} />
        <div
          class="mx-6 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-8"
        >
          <ContentLocaleDefaults
            organisationName={name}
            {...{ scope: 'organisation' as const }}
            value={settings.contentLocales ?? undefined}
            {inheritedLocales}
            inheritedOrigin="user-default"
            {options}
            {disabled}
            onChange={onContentLocalesChange}
            {issues}
          />
          <MultilingualDefaults
            {...{ scope: 'organisation' as const }}
            value={settings}
            {disabled}
            onChange={onMultilingualDefaultsChange}
          />
        </div>
      </section>
      <section class="border-border flex min-w-0 flex-col gap-4 md:border-l">
        <SectionHeader title={m.content_visibility_heading()} icon={VisibilityIcon} />
        <div
          class="border-border bg-foreground/4 mx-6 flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border px-5 py-3"
        >
          <span class="text-sm font-semibold"
            >{m.organisation_location_visibility_default()}</span
          >
          <LocationVisibilitySelect
            value={visibility}
            {disabled}
            onChange={onVisibilityChange}
          />
          <input {...visibilityAttrs}>
        </div>
      </section>
    </div>
    <SectionHeader title={m.organisation_permissions_heading()} icon={ShieldIcon} />
    <div class="mx-6 min-w-0">
      <OrganisationPermissions
        {permitted}
        canManage={canManagePermissions}
        {disabled}
        onChange={onPermissionChange}
      />
      {#if canManagePermissions}
        <input {...permissionAttrs}>
      {/if}
    </div>
  </section>
</FormSurface>
