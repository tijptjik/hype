<script lang="ts">
// SVELTE
import { page } from '$app/state'
// I18N
import { m } from '$lib/i18n'
import { getLocale, getLocaleOrder, translateI18nFields } from '$lib/i18n'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import { getOrganisation, organisationForm } from '$lib/api/server/organisation.remote'
// BITS COMPONENTS
import { FormI18nSection } from '$lib/bits'
import { TextArea, TextInput } from '$lib/bits/custom/form'
// ICONS
import OrganisationIcon from 'virtual:icons/lucide/users-round'
import FormInputIcon from 'virtual:icons/lucide/form-input'
import ImageIcon from 'virtual:icons/lucide/image'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Locale, Organisation } from '$lib/types'

// § Config

const facetTabs = new Map([
  ['core', { label: 'Profile', icon: FormInputIcon }],
  ['images', { label: 'Image', icon: ImageIcon }],
] as const)

// § Context

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// § State

let contentsElement: HTMLFormElement | undefined = $state()
let organisation = $state<Awaited<ReturnType<typeof getOrganisation>> | null>(null)
let genAiByLocale = $state<
  Record<Locale, { name: boolean; nameShort: boolean; description: boolean }>
>({
  en: { name: false, nameShort: false, description: false },
  'zh-hans': { name: false, nameShort: false, description: false },
  'zh-hant': { name: false, nameShort: false, description: false },
})

// § Reactive Aliases

const organisationRef = $derived(page.params.organisation as string)

const formFieldKeys = $derived(
  organisationForm?.fields ? Object.keys(organisationForm.fields) : [],
)
const fieldLocaleKeys = $derived(
  organisationForm?.fields?.i18n ? Object.keys(organisationForm.fields.i18n) : [],
)
const orderedLocales = $derived(getLocaleOrder(getLocale()))
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
const isCoreFacet = $derived(activeFacet === 'core')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const flags = $derived(
  organisation?.data?.hubId != null
    ? [
        {
          key: 'isHubExclusive',
          label: m.long_fit_vole_flow(),
          checked: Boolean(organisation.data.isHubExclusive),
          isEditing,
          isNullable: false,
          onCheckedChange: handleHubExclusiveToggle,
        },
      ]
    : [],
)
let lastHeaderKey = $state('')

// § Handlers

function syncGenAiFromOrganisation(data: Organisation): void {
  genAiByLocale = {
    en: {
      name: Boolean(data.i18n?.en?.nameGen),
      nameShort: Boolean(data.i18n?.en?.nameShortGen),
      description: Boolean(data.i18n?.en?.descriptionGen),
    },
    'zh-hans': {
      name: Boolean(data.i18n?.['zh-hans']?.nameGen),
      nameShort: Boolean(data.i18n?.['zh-hans']?.nameShortGen),
      description: Boolean(data.i18n?.['zh-hans']?.descriptionGen),
    },
    'zh-hant': {
      name: Boolean(data.i18n?.['zh-hant']?.nameGen),
      nameShort: Boolean(data.i18n?.['zh-hant']?.nameShortGen),
      description: Boolean(data.i18n?.['zh-hant']?.descriptionGen),
    },
  }
}

function updateOrganisationFormData(
  updater: (data: Organisation) => Organisation,
): void {
  if (!organisation?.data) return
  // `organisation.data` is a Svelte proxy; structuredClone throws on proxies.
  // Clone through JSON to get a plain object for safe mutation in updater.
  const nextData = updater(
    JSON.parse(JSON.stringify(organisation.data)) as Organisation,
  )
  organisation = { ...organisation, data: nextData }
  organisationForm.fields.set(nextData)
  syncGenAiFromOrganisation(nextData)
}

function handleToggleGenAi(
  locale: Locale,
  field: 'name' | 'nameShort' | 'description',
): void {
  updateOrganisationFormData(data => {
    if (!data.i18n) return data
    if (!data.i18n[locale]) return data
    const nextValue = !data.i18n[locale][`${field}Gen`]
    data.i18n[locale][`${field}Gen` as 'nameGen' | 'nameShortGen' | 'descriptionGen'] =
      nextValue
    return data
  })
}

function handleHubExclusiveToggle(nextChecked: boolean | null): void {
  updateOrganisationFormData(data => {
    data.isHubExclusive = Boolean(nextChecked)
    return data
  })
}

async function handleTranslateLocale(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<void> {
  if (!organisation?.data) return

  const translated = await translateI18nFields({
    source: sourceLocale,
    target: targetLocale,
    fields: ['name', 'description'],
    i18n: organisation.data.i18n as Record<
      Locale,
      Record<string, string | null | undefined>
    >,
  })

  updateOrganisationFormData(data => {
    if (!data.i18n) return data
    if (!data.i18n[targetLocale]) return data
    data.i18n[targetLocale].name = translated.name
    data.i18n[targetLocale].description = translated.description
    data.i18n[targetLocale].nameGen = true
    data.i18n[targetLocale].descriptionGen = true
    return data
  })
}

// § Effects

$effect(() => {
  const ref = organisationRef
  let cancelled = false

  adminCtx.setFacet('core', ref, FirstClassResource.organisation)

  void getOrganisation({ ref, refKey: 'code' })
    .then(result => {
      if (cancelled) return
      organisation = result
      if (result?.data) {
        organisationForm.fields.set(result.data)
        syncGenAiFromOrganisation(result.data)
      }
    })
    .catch(() => {
      if (cancelled) return
      organisation = null
    })

  return () => {
    cancelled = true
  }
})

$effect(() => {
  const ref = organisationRef
  const title =
    organisation?.data?.i18n?.[getLocale()]?.name ??
    organisation?.data?.code ??
    'Organisation'
  const headerKey = `${ref}:${title}`

  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey

  headerCtrl.setHeaderForEntity(title, OrganisationIcon, facetTabs)
})
</script>

<main class="h-full overflow-y-auto p-6">
  <section class:hidden={!isCoreFacet}>
    <form
      bind:this={contentsElement}
      {...organisationForm}
      class="bits-theme space-y-4"
    >
      {#if organisationForm?.fields && organisation?.data}
        <FormI18nSection
          title={m.admin__forms_common_descriptors()}
          locales={orderedLocales}
          onTranslate={handleTranslateLocale}
          {isEditing}
          {flags}
        >
          {#snippet children(locale)}
            {@const fields = organisationForm.fields.i18n[locale]}
            {@const nameInputAttrs = fields.name.as('text')}
            {@const nameShortInputAttrs = fields.nameShort.as('text')}
            {@const descriptionTextAreaAttrs = fields.description.as('text')}

            <TextInput
              label={m.admin__forms_common_name_full()}
              {locale}
              isTranslated={true}
              required={true}
              {isEditing}
              isGenAI={genAiByLocale[locale].name}
              onToggleGenAI={() => handleToggleGenAi(locale, 'name')}
              value={(nameInputAttrs as { value?: string }).value ?? ''}
              inputAttrs={nameInputAttrs as Record<string, unknown>}
            />

            <TextInput
              label={m.admin__forms_common_name_short()}
              {locale}
              isTranslated={true}
              required={true}
              {isEditing}
              isGenAI={genAiByLocale[locale].nameShort}
              onToggleGenAI={() => handleToggleGenAi(locale, 'nameShort')}
              value={(nameShortInputAttrs as { value?: string }).value ?? ''}
              inputAttrs={nameShortInputAttrs as Record<string, unknown>}
            />

            <TextArea
              label="Description"
              {locale}
              isTranslated={true}
              required={true}
              {isEditing}
              isGenAI={genAiByLocale[locale].description}
              onToggleGenAI={() => handleToggleGenAi(locale, 'description')}
              value={(descriptionTextAreaAttrs as { value?: string }).value ?? ''}
              textareaAttrs={descriptionTextAreaAttrs as Record<string, unknown>}
            />
          {/snippet}
        </FormI18nSection>

        {@const codeInputAttrs = organisationForm.fields.code.as('text')}
        <TextInput
          label="Code"
          {isEditing}
          value={(codeInputAttrs as { value?: string }).value ?? ''}
          inputAttrs={codeInputAttrs as Record<string, unknown>}
        />

        {@const urlInputAttrs = organisationForm.fields.url.as('url')}
        <TextInput
          label="Url"
          {isEditing}
          value={(urlInputAttrs as { value?: string }).value ?? ''}
          inputAttrs={urlInputAttrs as Record<string, unknown>}
        />
      {/if}
    </form>
  </section>
  <section class:hidden={!isImagesFacet}>
    <p class="text-sm text-neutral-content">Active tab: profile image management.</p>
  </section>
</main>
