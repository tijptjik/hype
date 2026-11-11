<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
import DescriptionsIcon from 'virtual:icons/lucide/file-text'
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
  profileIcon = DescriptionsIcon,
  expanded = false,
  membersIcon,
  detailsIcon,
  membersTitle,
  membersSubtitle,
  memberCount = 3,
}: {
  locales: LocaleKey[]
  profileIcon?: Component
  expanded?: boolean
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
      byField
      title="Descriptions"
      subtitle="Names and descriptions in each language"
      {expanded}
      icon={profileIcon}
      {locales}
      fields={[
        { label: m.admin__forms_common_name_full() },
        { label: m.admin__forms_common_name_short() },
        { label: m.feature__description(), multiline: true },
      ]}
    />
    <FormSectionSkeleton
      reserveSearch
      title={membersTitle}
      subtitle={membersSubtitle}
      icon={membersIcon}
    >
      <FormMemberRowsSkeleton count={memberCount} />
    </FormSectionSkeleton>
    <FormSectionSkeleton title="Details" icon={detailsIcon}>
      <div
        class="md:[&>section+section]:border-border/50 grid min-w-0 gap-6 px-6 py-6 md:grid-cols-2 md:[&>section+section]:border-l md:[&>section+section]:pl-6"
      >
        <FormFieldSkeleton label="Code" readOnly />
        <FormFieldSkeleton label="Url" readOnly />
      </div>
    </FormSectionSkeleton>
  </FormSurface>
</div>
