<script lang="ts">
// SVELTE
import type { LocaleKey } from '#lib/types.js'
// COMPONENTS
import HubPolicyDocumentBody from '#lib/bits/patterns/policies/hubPolicyDialog/components/HubPolicyDocumentBody.svelte'
import {
  createDefaultHubPrivacyPolicy,
  createDefaultHubTermsOfService,
  renderPolicyMarkdown,
} from '#lib/services/policy.js'
import HubPoliciesHeader from '../formI18nSection/components/HubPoliciesHeader.svelte'
import FormHubLayersSection from '../formHubLayersSection/FormHubLayersSection.svelte'
import ImageIntentSettings from '#lib/bits/patterns/images/ImageIntentSettings.svelte'
import ImageIcon from 'virtual:icons/proicons/photo'
import FeatureIntentSettings from '../featureIntent/FeatureIntentSettings.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import OrganisationAdvancedSettings from '#lib/bits/patterns/organisationEditor/OrganisationAdvancedSettings.svelte'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions.js'
import { getLocaleKey } from '#lib/i18n.js'
import FormSurface from '../formSurface/FormSurface.svelte'
import FormProfileSkeleton from './FormProfileSkeleton.svelte'
import FormLocaleFieldsSkeleton from './components/FormLocaleFieldsSkeleton.svelte'
import FormMemberRowsSkeleton from './components/FormMemberRowsSkeleton.svelte'
import FormFieldSkeleton from './components/FormFieldSkeleton.svelte'
import FormSectionSkeleton from './components/FormSectionSkeleton.svelte'
import FormSelectionSkeleton from './components/FormSelectionSkeleton.svelte'
import HubRoutingSkeleton from './components/HubRoutingSkeleton.svelte'
import HubOrganisationsSkeleton from './components/HubOrganisationsSkeleton.svelte'
import HubSubscriptionSkeleton from './components/HubSubscriptionSkeleton.svelte'
import MapIcon from 'virtual:icons/lucide/map'
import MarkerIcon from 'virtual:icons/lucide/map-pin'
import CardIcon from 'virtual:icons/lucide/panels-top-left'
import FormFieldsSection from '../formFieldsSection/FormFieldsSection.svelte'
import OrganisationCapabilitiesSkeleton from '#lib/bits/patterns/capabilities/organisationCapabilities/OrganisationCapabilitiesSkeleton.svelte'
import HistorySkeleton from '#lib/bits/patterns/revisionHistory/HistorySkeleton.svelte'
import ImageWorkspaceSkeleton from '#lib/bits/patterns/images/ImageWorkspaceSkeleton.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { Checkbox } from '#lib/bits/custom/index.js'
// STYLES
import { resourceTabsStyles } from '../formSurface/resourceTabs.styles.js'
import { formSectionDividerStyles } from '../formSurface/formSurface.styles.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import DescriptionsIcon from 'virtual:icons/lucide/file-text'
import AdminIcon from 'virtual:icons/proicons/shield'
import UsersIcon from 'virtual:icons/proicons/person-multiple'
import TypeIcon from 'virtual:icons/proicons/text'

let {
  resource,
  facet = 'core',
  locales,
  expanded = false,
}: {
  resource: 'hub' | 'organisation' | 'project' | 'layer'
  facet?: string
  locales: LocaleKey[]
  expanded?: boolean
} = $props()
const fieldActions = {
  add: () => {},
  remove: () => {},
  increaseRank: () => {},
  decreaseRank: () => {},
}
</script>

{#snippet selectionRows(count = 2, image = true)}
  <div class="px-6 pb-6" aria-hidden="true">
    {#each Array(count) as _, index (index)}
      <div
        class="border-border/40 flex min-h-20 items-center gap-4 border-b py-3 last:border-b-0"
      >
        {#if image}
          <Skeleton class="size-14 shrink-0 rounded-lg" />
        {/if}
        <div class="min-w-0 flex-1 space-y-2">
          <Skeleton class="h-3.5 w-40 max-w-full" />
          <Skeleton class="h-3 w-24 max-w-full" />
        </div>
        <Skeleton class="h-5 w-12 shrink-0 rounded-full" />
      </div>
    {/each}
  </div>
{/snippet}

{#snippet details(labels: string[])}
  <div
    class="grid min-w-0 gap-6 px-6 py-6 {labels.length === 3
      ? 'md:grid-cols-3'
      : labels.length === 2
        ? 'md:grid-cols-2'
        : ''}"
  >
    {#each labels as label}
      <FormFieldSkeleton {label} readOnly />
    {/each}
  </div>
{/snippet}

{#if facet === 'capabilities' && resource === 'organisation'}
  <OrganisationCapabilitiesSkeleton />
{:else if facet === 'advanced' && resource === 'organisation'}
  <!-- The settings component owns responsive language, visibility and permission columns. -->
  <ContentSkeleton>
    <OrganisationAdvancedSettings
      name="Organisation"
      settings={{}}
      inheritedLocales={locales}
      options={contentLocaleOptions(getLocaleKey())}
      disabled
      issues={[]}
      visibility="shared"
      visibilityAttrs={{}}
      permitted={false}
      canManagePermissions={false}
      onVisibilityChange={() => {}}
      onPermissionChange={() => {}}
      onContentLocalesChange={() => {}}
      onMultilingualDefaultsChange={() => {}}
    />
  </ContentSkeleton>
{:else if facet === 'updates'}
  <HistorySkeleton showFields={resource !== 'layer'} />
{:else if facet === 'images'}
  <FormSurface class="mb-0! flex h-full min-h-0 flex-1 flex-col">
    <SectionHeader
      icon={ImageIcon}
      title={m.admin__forms_project_image_title()}
      description={m.admin__forms_project_image_description()}
      class="shrink-0"
    />
    <div class="min-h-0 flex-1"><ImageWorkspaceSkeleton /></div>
  </FormSurface>
{:else if facet === 'core' && resource === 'organisation'}
  <FormProfileSkeleton
    {locales}
    {expanded}
    membersIcon={UsersIcon}
    detailsIcon={TypeIcon}
    membersTitle="Staff"
    membersSubtitle="Owners and members manage this organisation."
  />
{:else}
  <FormSurface
    class={`flex min-h-0 flex-1 flex-col ${facet === 'layers' || facet === 'fields' ? resourceTabsStyles : ''}`}
  >
    <div
      role="status"
      aria-label={m.resource_loading()}
      aria-busy="true"
      class="flex min-h-0 flex-1 flex-col"
      data-resource-form-skeleton={resource}
    >
      {#if facet === 'fields'}
        <!-- The field editor owns its collapsed/expanded card placeholders and responsive tracks. -->
        <FormFieldsSection
          items={[]}
          isLoading
          localeSelection={{ selectedLocales: locales, visibleLocales: locales }}
          keepHeader
          title={m.admin__forms_common_fields()}
          description={m.admin__forms_common_fields_subtitle()}
          icon={TypeIcon}
          isEditing={false}
          actions={fieldActions}
        />
      {:else if facet === 'core'}
        <FormLocaleFieldsSkeleton
          title="Descriptions"
          subtitle="Names and descriptions in each language"
          icon={DescriptionsIcon}
          byField
          {locales}
          {expanded}
          fields={[
            { label: m.admin__forms_common_name_full() },
            { label: m.admin__forms_common_name_short() },
            { label: m.feature__description(), multiline: true },
          ]}
        >
          {#snippet afterField(field)}
            {#if resource === 'project' && field === 'nameShort'}
              <div
                class="border-border/50 mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4"
                inert
              >
                <Checkbox
                  disabled
                  rightText={m.admin__project_same_as_organisation()}
                  color="accent"
                  size="sm"
                />
                <span class="text-muted-foreground text-xs"
                  >{m.admin__project_same_as_organisation_hint()}</span
                >
              </div>
            {/if}
          {/snippet}
        </FormLocaleFieldsSkeleton>
        {#if resource !== 'layer'}
          <FormSectionSkeleton
            reserveSearch
            title={resource === 'hub'
              ? m.admin__forms_hub_admins_title()
              : m.admin__forms_project_members_title()}
            subtitle={resource === 'hub'
              ? m.admin__forms_hub_admins_subtitle()
              : m.admin__forms_project_members_subtitle()}
            icon={resource === 'hub' ? AdminIcon : UsersIcon}
          >
            <FormMemberRowsSkeleton />
          </FormSectionSkeleton>
        {/if}
        {#if resource === 'hub'}
          <div class={formSectionDividerStyles}><HubOrganisationsSkeleton /></div>
          <div class={formSectionDividerStyles}><HubRoutingSkeleton /></div>
          <div class={formSectionDividerStyles}>
            <HubSubscriptionSkeleton {locales} {expanded} />
          </div>
        {:else}
          <div class={`${formSectionDividerStyles} grid grid-cols-1 xl:grid-cols-3`}>
            {#each [
              {
                title: m.theme_map_style_label(),
                subtitle:
                  resource === 'layer'
                    ? m.theme_map_layer_style_description()
                    : 'Choose the basemap assigned to this project.',
                icon: MapIcon,
              },
              {
                title: 'Marker Style',
                subtitle:
                  resource === 'layer'
                    ? 'Inherit the project style or choose an override.'
                    : 'Choose how locations appear on the map.',
                icon: MarkerIcon,
              },
              {
                title: m.card_style__title(),
                subtitle:
                  resource === 'layer'
                    ? m.card_style__layer_description()
                    : m.card_style__project_description(),
                icon: CardIcon,
              },
            ] as section}
              <div
                class="border-border min-w-0 border-b last:border-0 xl:border-r xl:border-b-0"
              >
                <FormSelectionSkeleton {...section} />
              </div>
            {/each}
          </div>
          <div
            class={`${formSectionDividerStyles} grid grid-cols-1 ${resource === 'project' ? 'md:grid-cols-3' : 'xl:grid-cols-2'}`}
          >
            <section class="min-w-0">
              <SectionHeader
                title={resource === 'project'
                  ? 'Organisation'
                  : m.admin__forms_layer_parent_project_title()}
              />{@render selectionRows(1)}
            </section>
            <section class="border-border min-w-0 border-t md:border-t-0 md:border-l">
              <SectionHeader
                title={resource === 'project'
                  ? 'Licence'
                  : m.admin__forms_layer_project_default_title()}
              />{@render selectionRows(1, false)}
            </section>
            {#if resource === 'project'}
              <section class="border-border min-w-0 border-t md:border-t-0 md:border-l">
                <SectionHeader title={m.admin__project_identifiers_title()} />
                {@render details(['Code'])}
              </section>
            {/if}
          </div>
        {/if}
      {:else if facet === 'layers' && resource === 'hub'}
        <FormHubLayersSection
          title={m.maps__layers()}
          subtitle={m.admin__forms_hub_layers_subtitle()}
          localeKey={getLocaleKey()}
          items={[]}
          loading
          isEditing={false}
          onToggleDefault={() => {}}
        />
      {:else if facet === 'layers'}
        <SectionHeader title={resource === 'hub' ? m.maps__layers() : 'Layer Order'} />
        {@render selectionRows(4)}
      {:else if facet === 'capabilities'}
        <div class="grid flex-1 grid-rows-[repeat(2,minmax(min-content,1fr))]">
          <section>
            <SectionHeader
              title={m.resources__capabilities()}
              description={m.admin__forms_project_capabilities_subtitle()}
            />{@render selectionRows(3, false)}
          </section>
          <section class={formSectionDividerStyles}>
            <SectionHeader
              title={m.admin__forms_project_capability_matrix_title()}
              description={m.admin__forms_project_capability_matrix_subtitle()}
            /><FormMemberRowsSkeleton />
          </section>
        </div>
      {:else if facet === 'policies'}
        <FormLocaleFieldsSkeleton
          title="Policies"
          horizontalToolbar
          stickyFieldHeaders
          byField
          stackNames={false}
          {expanded}
          subtitle="Configure the privacy policy and terms of service shown for this hub."
          icon={DescriptionsIcon}
          {locales}
          fields={[
            { key: 'privacyPolicy', label: 'Privacy Policy', multiline: true },
            { key: 'termsOfService', label: 'Terms of Service', multiline: true },
          ]}
        >
          {#snippet toolbarHeader(toolbar)}
            <HubPoliciesHeader {toolbar} />
          {/snippet}
          {#snippet placeholder(field)}
            <!-- Default document typography supplies a representative initial document, without guessing bar heights. -->
            <ContentSkeleton class="min-w-0 px-3 py-[9px]">
              <HubPolicyDocumentBody
                class="min-w-0 overflow-x-auto break-words"
                html={renderPolicyMarkdown(
                  field === 'privacyPolicy'
                    ? createDefaultHubPrivacyPolicy(getLocaleKey())
                    : createDefaultHubTermsOfService(getLocaleKey()),
                )}
              />
            </ContentSkeleton>
          {/snippet}
        </FormLocaleFieldsSkeleton>
      {:else if facet === 'advanced' && resource === 'hub'}
        <div class="flex min-w-0 flex-col pb-6">
          <ImageIntentSettings scopeType="hub" scopeId="" loadingOnly disabled />
        </div>
      {:else if facet === 'advanced'}
        <SectionHeader
          title={resource === 'project' ? 'Data Model' : m.project_advanced()}
        />
        <div
          class="mx-6 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,max(480px,calc((100%_-_2rem)/2))),1fr))] gap-8 py-6"
          aria-hidden="true"
        >
          {#each Array(resource === 'project' ? 6 : 2) as _}
            <div
              class="border-border bg-foreground/4 flex min-h-14 items-center gap-4 rounded-xl border px-5 py-3"
            >
              <Skeleton class="h-3.5 w-3/5" />
              <Skeleton class="ml-auto h-6 w-12 rounded-full" />
            </div>
          {/each}
        </div>
      {:else if facet === 'location' && resource !== 'organisation'}
        <FeatureIntentSettings scopeType={resource} scopeId="" loadingOnly disabled />
      {:else}
        <SectionHeader title={facet === 'users' ? 'Users' : m.resources__profile()} />
        <FormMemberRowsSkeleton />
      {/if}
    </div>
  </FormSurface>
{/if}
