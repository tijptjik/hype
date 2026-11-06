<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// ICONS
import RefreshCw from 'virtual:icons/proicons/arrow-sync'
import PoliciesIcon from 'virtual:icons/proicons/shield-checkmark'
// COMPONENTS
import HubPolicyDocumentBody from '#lib/bits/patterns/policies/hubPolicyDialog/components/HubPolicyDocumentBody.svelte'
import { renderPolicyMarkdown } from '#lib/services/policy.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import FormI18nDescriptorProfile from '#lib/bits/patterns/forms/formI18nSection/FormI18nDescriptorProfile.svelte'
import FieldEditorFixture from './FieldEditorFixture.svelte'
import FormHubSpecifiersFields from '#lib/bits/patterns/forms/formI18nSection/components/FormHubSpecifiersFields.svelte'
import FormHubSubscriptionSection from '#lib/bits/patterns/forms/formI18nSection/components/FormHubSubscriptionSection.svelte'
import { HubSubscriptionService } from '#lib/enums.js'
import FormOrganisationsSection from '#lib/bits/patterns/forms/formOrganisationsSection/FormOrganisationsSection.svelte'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { formSelectionSectionStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
// TYPES
import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'
import type { DescriptorData } from '#lib/bits/patterns/forms/formI18nSection/components/formI18nDescriptorFields.types.js'
import type { ProfileProviderResult } from '#lib/bits/patterns/forms/featureLocation/profileTranslation.js'

let {
  provider = async (
    _source: string,
    target: string,
    text: string,
  ): Promise<ProfileProviderResult> => ({
    status: 'translated',
    text: `${target}: ${text}`,
  }),
}: {
  provider?: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
} = $props()
setResponsiveCtx()
let mode = $state('organisation')
let tab = $state('profile')
let multilingualExpanded = $state(false)
let contentLocaleSelection = $state<LocaleSelection | null>(null)
let editing = $state(false)
type FixtureData = DescriptorData & {
  code?: string
  domain?: string
  legalContactAddress?: string
  subscriptionId?: string
  subscriptionSessionCookie?: string
}
let data = $state<FixtureData>({})
let available = $state(true)
let placement = $state({ topBar: false, hubPanel: false, menu: true })
let selections = $state([
  { organisationId: 'eunic', isCoreInclusive: true, isHubExclusive: false },
  { organisationId: 'hkfoodworks', isCoreInclusive: true, isHubExclusive: false },
])
$effect(() => {
  const name = mode === 'organisation' ? 'HKFoodWorks' : 'Breadline'
  data = {
    code: 'breadline',
    domain: 'breadline.hk',
    legalContactAddress: 'hello@example.test',
    subscriptionId: 'community',
    subscriptionSessionCookie: '',
    i18n: {
      en: {
        name,
        nameShort: name,
        description: '<p>Working together for a <strong>better tomorrow</strong>.</p>',
        descriptionGen: true,
        subscriptionBenefits: '<p>Community news and opportunities.</p>',
        privacyPolicy:
          '# Privacy Policy\n\nWe protect **your data**.\n\n| Party | Role |\n| --- | --- |\n| HYPE | Provider |',
        privacyPolicyGen: true,
        termsOfService: '# Terms of Service\n\nPlease respect the community.',
      },
      zhHant: {
        name: '香港劇場',
        nameShort: '香港劇場',
        description: '',
        nameGen: true,
      },
      zhHans: { name: '香港剧场', nameShort: '香港剧场', description: '' },
      ja: { nameShort: '日本語' },
    },
  }
})
const fields = new Proxy({} as Record<string, object>, {
  get: (_target, locale: string) =>
    new Proxy(
      {},
      {
        get: (_row, key: string) => ({
          as: (type: string, hidden?: string) => ({
            name: `data.i18n.${locale}.${key}`,
            value: hidden ?? data.i18n?.[locale]?.[key as 'name'] ?? '',
            ...(type === 'text'
              ? {
                  oninput: (event: Event) => {
                    data = {
                      ...data,
                      i18n: {
                        ...data.i18n,
                        [locale]: {
                          ...data.i18n?.[locale],
                          [key]: (event.target as HTMLInputElement).value,
                        },
                      },
                    }
                  },
                }
              : { type }),
          }),
          issues: () => undefined,
        }),
      },
    ),
})
let organisations = $state([
  {
    id: 'eunic',
    code: 'eunic',
    image: null,
    i18n: { en: { name: 'EU National Institutes for Culture' } },
  },
  {
    id: 'hkfoodworks',
    code: 'hkfoodworks',
    image: null,
    i18n: { en: { name: 'HKFoodWorks' } },
  },
])

function control(key: keyof Omit<FixtureData, 'i18n'>) {
  return {
    as: (type: string) => ({
      name: `data.${key}`,
      value: data[key] ?? '',
      ...(type === 'select'
        ? {}
        : {
            oninput: (event: Event) => {
              data = { ...data, [key]: (event.target as HTMLInputElement).value }
            },
          }),
    }),
    set: (value: string) => {
      data = { ...data, [key]: value }
    },
    issues: () => undefined,
  }
}
const hidden = { as: (_type: string, value: string) => ({ value }) }
const form = {
  fields: {
    value: () => ({ data }),
    set: (next: { data?: FixtureData }) => {
      if (next.data) data = next.data
    },
    data: {
      i18n: fields,
      code: control('code'),
      domain: control('domain'),
      legalContactAddress: control('legalContactAddress'),
      subscriptionId: control('subscriptionId'),
      subscriptionSessionCookie: control('subscriptionSessionCookie'),
      subscriptionService: {
        as: () => ({ name: 'data.subscriptionService', value: 'substack' }),
        issues: () => undefined,
      },
      isSubscriptionAvailable: hidden,
      subscriptionPlacement: { topBar: hidden, hubPanel: hidden, menu: hidden },
    },
  },
}
</script>
<div class="bits-theme bg-panel text-foreground min-h-screen">
  <nav class="flex flex-wrap gap-4 p-6">
    <button
      type="button"
      onclick={() => {
        mode = 'organisation'
      }}
    >
      Organisation profile
    </button>
    <button
      type="button"
      onclick={() => {
        mode = 'hub'
      }}
    >
      Hub profile
    </button>
    <button
      type="button"
      onclick={() => {
        editing = !editing
      }}
    >
      Toggle editing
    </button>
    {#if mode === 'hub'}
      <button
        type="button"
        onclick={() => {
          tab = 'profile'
        }}
      >
        Profile tab
      </button>
      <button
        type="button"
        onclick={() => {
          tab = 'policies'
        }}
      >
        Policies tab
      </button>
      <button
        type="button"
        onclick={() => {
          tab = 'fields'
        }}
      >
        Fields tab
      </button>
    {/if}
  </nav>
  <div class="h-[calc(100dvh-72px)] overflow-y-auto" data-fixture-scroll>
    <FormSurface>
      {#if tab === 'policies'}
        <FormI18nDescriptorProfile
          bind:expanded={multilingualExpanded}
          bind:localeSelection={contentLocaleSelection}
          allowAddLocales={mode === 'hub'}
          {form}
          {fields}
          defaultLocales={['en', 'zh-Hant', 'zh-Hans']}
          recordKey={mode}
          isEditing={editing}
          isRequiredInPreflight={() => false}
          stickyToolbar
          stickyFieldHeaders
          stackNames={false}
          showPrimaryLocaleHeader={false}
          localeHeaderPlacement="gutter"
          fieldConfigs={[
            {
              key: 'privacyPolicy',
              markdown: true,
              label: 'Privacy Policy',
              kind: 'textarea',
              renderHtml: false,
            },
            {
              key: 'termsOfService',
              markdown: true,
              label: 'Terms of Service',
              kind: 'textarea',
              renderHtml: false,
            },
          ]}
          translate={provider}
          onChange={() => {}}
        >
          {#snippet toolbarHeader(toolbar)}
            <SectionHeader
              title="Policies"
              icon={PoliciesIcon}
              description="Configure the privacy policy and terms of service shown for this hub."
              showControlLabels
            >
              {#snippet right()}
                {@render toolbar()}
              {/snippet}
              {#snippet afterControls()}
                <button
                  type="button"
                  disabled={!editing}
                  onclick={() => {}}
                  class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline-2 disabled:opacity-50"
                >
                  <RefreshCw class="size-4" />Regenerate
                </button>
              {/snippet}
            </SectionHeader>
          {/snippet}
          {#snippet renderValue(_field, value)}
            <HubPolicyDocumentBody
              html={renderPolicyMarkdown(value)}
              class="min-w-0 overflow-x-auto break-words"
            />
          {/snippet}
        </FormI18nDescriptorProfile>
      {:else if tab === 'fields'}
        <FieldEditorFixture
          bind:localeSelection={contentLocaleSelection}
          bind:multilingual={multilingualExpanded}
          fieldCount={3}
        />
      {:else}
        <FormI18nDescriptorProfile
          bind:expanded={multilingualExpanded}
          bind:localeSelection={contentLocaleSelection}
          allowAddLocales={mode === 'hub'}
          {form}
          {fields}
          defaultLocales={['en', 'zh-Hant', 'zh-Hans']}
          recordKey={mode}
          isEditing={editing}
          isRequiredInPreflight={() => false}
          stickyToolbar
          stickyFieldHeaders={['description']}
          showPrimaryLocaleHeader={false}
          localeHeaderPlacement="gutter"
          translate={provider}
          onChange={() => {}}
        >
          {#snippet children(localeState)}
            {#if mode === 'hub'}
              <FormOrganisationsSection
                title="Organisations"
                subtitle="Belonging to this hub"
                class={formSelectionSectionStyles}
                {organisations}
                {selections}
                isEditing={editing}
                canSetCoreInclusive
                onSearchOrganisations={async () => [
                  {
                    id: 'new',
                    code: 'new',
                    image: null,
                    i18n: { en: { name: 'New partner' } },
                  },
                ]}
                onAddOrganisation={organisation => {
                  organisations = [
                    ...organisations,
                    organisation as (typeof organisations)[number],
                  ]
                }}
                onRemoveOrganisation={id => {
                  organisations = organisations.filter(
                    organisation => organisation.id !== id,
                  )
                }}
                onToggleCoreInclusive={(id, value) => {
                  selections = selections.map(row =>
                    row.organisationId === id
                      ? { ...row, isCoreInclusive: value }
                      : row,
                  )
                }}
                onToggleHubExclusive={(id, value) => {
                  selections = selections.map(row =>
                    row.organisationId === id ? { ...row, isHubExclusive: value } : row,
                  )
                }}
              />
              <FormHubSpecifiersFields
                {form}
                isEditing={editing}
                isRequiredInPreflight={() => false}
              />
              <FormHubSubscriptionSection
                {form}
                {localeState}
                recordKey={mode}
                isEditing={editing}
                isSubscriptionAvailable={available}
                subscriptionService={HubSubscriptionService.substack}
                subscriptionPlacement={placement}
                translate={provider}
                onAvailabilityChange={value => {
                  available = value
                }}
                onPlacementChange={(key, value) => {
                  placement = { ...placement, [key]: value }
                }}
              />
            {/if}
          {/snippet}
        </FormI18nDescriptorProfile>
      {/if}
    </FormSurface>
  </div>
  <div data-descriptor-state={JSON.stringify({ data, selections })}></div>
</div>
