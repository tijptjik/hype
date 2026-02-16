<script lang="ts">
import { page } from '$app/state'
import { fade } from 'svelte/transition'
import { getOrganisation, organisationForm } from '$lib/api/server/organisation.remote'
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
import { FirstClassResource } from '$lib/enums'
import { getLocale, getLocaleOrder } from '$lib/i18n'
import OrganisationIcon from 'virtual:icons/lucide/users-round'

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
        organisationForm.fields.set(result.data as any)
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
  organisationForm?.fields?.i18n
    ? Object.keys(organisationForm.fields.i18n)
    : [],
)
const orderedLocales = $derived(getLocaleOrder(getLocale()))
const activeFacet = $derived(adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet)
const isCoreFacet = $derived(activeFacet === 'core')
const isImagesFacet = $derived(activeFacet === 'images')

$effect(() => {
  const facetTabs = new Map([
    ['core', 'Core'],
    ['images', 'Profile'],
  ] as const)

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
  <form bind:this={contentsElement} {...organisationForm} class="space-y-4">
    {#if isLoading}
      <p class="text-sm text-neutral-content" transition:fade={{ duration: 150 }}>
        Loading organisation...
      </p>
    {:else if organisationForm?.fields && organisation?.data}
      <section class:hidden={!isCoreFacet} transition:fade={{ duration: 150 }}>
        {#if organisationForm.fields.code}
          <label>
            <p>Code</p>
            <input {...organisationForm.fields.code.as('text')} />
          </label>
        {/if}

        {#if organisationForm.fields.url}
          <label>
            <p>Url</p>
            <input {...organisationForm.fields.url.as('url')} />
          </label>
        {/if}

        {#if organisationForm.fields.i18n}
          {#each orderedLocales as locale (locale)}
            {@const fields = organisationForm.fields.i18n?.[locale]}
            {#if fields}
              <h2>{locale}</h2>
              {#if fields.name}
                <label>
                  <p>Name</p>
                  <input {...fields.name.as('text')} />
                </label>
              {/if}
              {#if fields.description}
                <label>
                  <p>Description</p>
                  <textarea {...fields.description.as('text')}></textarea>
                </label>
              {/if}
            {/if}
          {/each}
        {/if}
      </section>

      <section class:hidden={!isImagesFacet} transition:fade={{ duration: 150 }}>
        <p class="text-sm text-neutral-content">
          Active tab: profile image management.
        </p>
      </section>
    {:else}
      <p transition:fade={{ duration: 150 }}>Form fields are not available.</p>
    {/if}

    {#if !isLoading}
      <p class="text-xs text-neutral-content">
        form field keys: {formFieldKeys.length > 0 ? formFieldKeys.join(', ') : 'none'}
      </p>
      <p class="text-xs text-neutral-content">
        i18n field locales: {fieldLocaleKeys.length > 0 ? fieldLocaleKeys.join(', ') : 'none'}
      </p>
    {/if}
  </form>

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
