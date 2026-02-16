<script lang="ts">
import { page } from '$app/state'
import { getOrganisation, organisationForm } from '$lib/api/server/organisation.remote'
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
import { FirstClassResource } from '$lib/enums'
import { getLocale, getLocaleOrder } from '$lib/i18n'
import OrganisationIcon from 'virtual:icons/lucide/users-round'
import FormInput from 'virtual:icons/lucide/form-input'
import ImageIcon from 'virtual:icons/lucide/image'

let organisation = await getOrganisation({
  ref: page.params.organisation as string,
  refKey: 'code',
})

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

adminCtx.setFacet(
  'core',
  page.params.organisation as string,
  FirstClassResource.organisation,
)

let contentsElement: HTMLFormElement | undefined = $state()

if (organisation?.data) {
  organisationForm.fields.set(organisation.data as any)
}

const formFieldKeys = $derived(
  organisationForm?.fields ? Object.keys(organisationForm.fields) : [],
)
const fieldLocaleKeys = $derived(
  organisationForm?.fields?.i18n
    ? Object.keys(organisationForm.fields.i18n)
    : [],
)
const orderedLocales = $derived(getLocaleOrder(getLocale()))

headerCtrl.setHeaderForEntity(
  organisation?.data?.i18n?.[getLocale()]?.name ??
    organisation?.data?.code ??
    'Organisation',
  OrganisationIcon,
  new Map([['core', 'Core']]),
)
headerCtrl.setFacets([
  { ref: 'core', label: 'Core', icon: FormInput },
  { ref: 'images', label: 'Profile', icon: ImageIcon },
])

$effect(() => {
  console.log('code', !!organisationForm?.fields?.code)
  console.log('url', !!organisationForm?.fields?.url)
  console.log('i18n', !!organisationForm?.fields?.i18n)
  console.log(
    'i18n.en.name',
    !!organisationForm?.fields?.i18n?.en?.name,
  )
  console.log(
    'i18n.en.description',
    !!organisationForm?.fields?.i18n?.en?.description,
  )
})
</script>

<main class="h-full overflow-y-auto p-6">
  <form bind:this={contentsElement} {...organisationForm} class="space-y-4">
    {#if organisationForm?.fields}
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
    {:else}
      <p>Form fields are not available.</p>
    {/if}

    <p class="text-xs text-neutral-content">
      form field keys: {formFieldKeys.length > 0 ? formFieldKeys.join(', ') : 'none'}
    </p>
    <p class="text-xs text-neutral-content">
      i18n field locales: {fieldLocaleKeys.length > 0 ? fieldLocaleKeys.join(', ') : 'none'}
    </p>
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
