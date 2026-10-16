<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import FormSurface from '../formSurface/FormSurface.svelte'
import FormFieldSkeleton from './components/FormFieldSkeleton.svelte'
import FormSectionSkeleton from './components/FormSectionSkeleton.svelte'
import FormLocaleFieldsSkeleton from './components/FormLocaleFieldsSkeleton.svelte'
import FormMemberRowsSkeleton from './components/FormMemberRowsSkeleton.svelte'
// TYPES
import type { LocaleKey } from '#lib/types.js'
let {
  locales,
  profileIcon,
  membersIcon,
  detailsIcon,
  membersTitle,
  membersSubtitle,
  memberCount = 3,
}: {
  locales: LocaleKey[]
  profileIcon?: Component
  membersIcon?: Component
  detailsIcon?: Component
  membersTitle: string
  membersSubtitle?: string
  memberCount?: number
} = $props()
</script>

<div role="status" aria-live="polite" aria-busy="true" data-form-skeleton>
  <span class="sr-only">{m.resource_loading()}</span>
  <FormSurface>
    <FormLocaleFieldsSkeleton
      title="Profile"
      icon={profileIcon}
      {locales}
      fields={[
        { label: m.admin__forms_common_name_full() },
        { label: m.admin__forms_common_name_short() },
        { label: m.feature__description(), multiline: true },
      ]}
    />
    <FormSectionSkeleton
      title={membersTitle}
      subtitle={membersSubtitle}
      icon={membersIcon}
    >
      <FormMemberRowsSkeleton count={memberCount} />
    </FormSectionSkeleton>
    <FormSectionSkeleton title="Details" icon={detailsIcon}>
      <div class="bits-form__i18n-card no-i18n">
        <div class="flex flex-col gap-4 pb-2 pt-2">
          <FormFieldSkeleton label="Code" />
          <FormFieldSkeleton label="Url" />
        </div>
      </div>
    </FormSectionSkeleton>
  </FormSurface>
</div>
