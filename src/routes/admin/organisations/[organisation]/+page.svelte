<script lang="ts">
import { page } from '$app/state'
import { fade } from 'svelte/transition'
import { getOrganisation, organisationForm } from '$lib/api/server/organisation.remote'
import { FormI18nSection } from '$lib/bits'
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
import { FirstClassResource } from '$lib/enums'
import { getLocale, getLocaleOrder } from '$lib/i18n'
import OrganisationIcon from 'virtual:icons/lucide/users-round'
import FormInputIcon from 'virtual:icons/lucide/form-input'
import ImageIcon from 'virtual:icons/lucide/image'

let organisation = $state<Awaited<ReturnType<typeof getOrganisation>> | null>(null)
let isLoading = $state(true)

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
const organisationRef = $derived(page.params.organisation as string)

let contentsElement: HTMLFormElement | undefined = $state()

$effect(() => {
  const ref = organisationRef
  let cancelled = false

  adminCtx.setFacet('core', ref, FirstClassResource.organisation)
  isLoading = true

  void getOrganisation({ ref, refKey: 'code' })
    .then(result => {
      if (cancelled) return
      organisation = result
      if (result?.data) {
        organisationForm.fields.set(result.data)
      }
      isLoading = false
    })
    .catch(() => {
      if (cancelled) return
      organisation = null
      isLoading = false
    })

  return () => {
    cancelled = true
  }
})

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
const facetTabs = new Map([
  ['core', { label: 'Profile', icon: FormInputIcon }],
  ['images', { label: 'Image', icon: ImageIcon }],
] as const)

$effect(() => {
  headerCtrl.setHeaderForEntity(
    organisation?.data?.i18n?.[getLocale()]?.name ??
      organisation?.data?.code ??
      'Organisation',
    OrganisationIcon,
    facetTabs,
  )
})
</script>

<main class="h-full overflow-y-auto p-6">
  <section class:hidden={!isCoreFacet} transition:fade={{ duration: 150 }}>
    <form
      bind:this={contentsElement}
      {...organisationForm}
      class="bits-theme space-y-4"
    >
      {#if isLoading}
        <p class="text-sm text-neutral-content" transition:fade={{ duration: 150 }}>
          Loading organisation...
        </p>
      {:else if organisationForm?.fields && organisation?.data}
        <FormI18nSection
          title="Translations"
          subtitle="Edit per-locale values."
          locales={orderedLocales}
        >
          {#snippet children(locale)}
            {@const fields = organisationForm.fields.i18n[locale]}
            <label class="flex flex-col gap-1">
              <p class="text-sm font-bold">Name</p>
              <input {...fields.name.as('text')}>
            </label>
            <label class="flex flex-col gap-1">
              <p class="text-sm font-bold">Description</p>
              <textarea {...fields.description.as('text')}></textarea>
            </label>
          {/snippet}
        </FormI18nSection>

        <label>
          <p>Code</p>
          <input {...organisationForm.fields.code.as('text')}>
        </label>

        <label>
          <p>Url</p>
          <input {...organisationForm.fields.url.as('url')}>
        </label>
      {/if}
    </form>
  </section>
  <section class:hidden={!isImagesFacet} transition:fade={{ duration: 150 }}>
    <p class="text-sm text-neutral-content">Active tab: profile image management.</p>
  </section>

  <!-- {#if organisation?.data}
    <h1 class="text-xl font-semibold">
      {organisation.data.code}
      <sup class="text-xs text-pretty">{organisation.data.id}</sup>
    </h1>
    <pre class="mt-4 overflow-auto rounded bg-base-200 p-4 text-xs">{JSON.stringify(organisation, null, 2)}</pre>
  {:else}
    <p>Organisation not found.</p>
  {/if} -->
</main>
