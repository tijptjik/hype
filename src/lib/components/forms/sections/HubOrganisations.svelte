<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import OrganisationActions from '$lib/components/forms/actions/Organisation.svelte';
import OrganisationField from '$lib/components/forms/fields/Organisations.svelte';
import HeaderSearch from '$lib/components/forms/extra/Search.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { ExclamationTriangle } from '@steeze-ui/heroicons';
// TYPES
import type {
  Resource,
  SectionProps,
  OrganisationJoinConfig,
  HubForm,
  Organisation
} from '$lib/types';
import { m } from '$lib/i18n';

// STATE : PROPS
let sectionProps: SectionProps & { joinConfig: OrganisationJoinConfig } = $props();
let { form, fields, joinConfig } = sectionProps;
let formStore = $derived((form as HubForm).form);

// STATE
let searchMode = $state(false);
let removeMode = $state(false);

let fieldRoot = $derived(Object.keys(fields)[0] as keyof Resource);

// Helper function to transform organisation for hub
const transformOrganisationForHub = (organisation: Organisation, hubId: string) => {
  // Ensure i18n is in Record format expected by schema
  const ensureI18nRecordFormat = (i18nData: any) => {
    if (!i18nData) return null;
    if (!Array.isArray(i18nData)) return i18nData; // Already in Record format

    return i18nData.reduce((acc: any, bundle: any) => {
      acc[bundle.locale] = bundle;
      return acc;
    }, {});
  };

  // Transform image to only include basic CDN fields to avoid validation errors
  const transformImageToBasic = (image: any) => {
    if (!image) return null;
    return {
      id: image.id,
      cdn: image.cdn,
      env: image.env,
      cdnId: image.cdnId,
      publicId: image.publicId,
      version: image.version,
      metadata: image.metadata
    };
  };

  return {
    ...organisation,
    isCoreInclusive: true,
    isHubExclusive: false,
    hubId: hubId || null,
    i18n: ensureI18nRecordFormat(organisation.i18n),
    image: transformImageToBasic(organisation.image)
  };
};

// Remove the old search functions and replace with HeaderSearch-compatible functions
const isOrganisationNotAlreadyAdded = (item: any) => {
  const currentOrganisations = ($formStore as any).organisations || [];
  // Ensure we have a valid item with an ID
  if (!item || !item.id) {
    return false;
  }

  // Check if this organisation ID is already in the form
  const isAlreadyAdded = currentOrganisations.some((org: any) => {
    return org && org.id && org.id === item.id;
  });

  return !isAlreadyAdded;
};

const toOrganisationItem = (item: any) => {
  return transformOrganisationForHub(
    item as Organisation,
    ($formStore as any).id || null
  );
};
</script>

<div class="min-h-60 basis-2/3 overflow-hidden rounded-2xl p-0">
  <Header {...sectionProps}>
    {#snippet actionContent()}
      <OrganisationActions bind:removeMode bind:searchMode />
    {/snippet}
  </Header>
  {#if searchMode}
    <HeaderSearch
      {...sectionProps}
      bind:searchMode
      apiPath="organisations"
      {fieldRoot}
      isExistingCheck={isOrganisationNotAlreadyAdded}
      toItem={toOrganisationItem}
      itemRef="id" />
  {/if}
  {#if removeMode}
    <div
      transition:slide={{ duration: 200 }}
      class="alert w-full rounded-none border-0 border-b-4 border-warning">
      <Icon src={ExclamationTriangle} class="h-6 w-6 shrink-0 stroke-current" />
      <span
        ><span class="font-bold text-warning">{m.funny_bright_lynx_grin()}:</span>
        {m.hub_organisations_empty_warning()}
      </span>
    </div>
  {/if}
  {#each Object.entries(fields) as [fieldRoot, field], index}
    <OrganisationField
      {...sectionProps}
      bind:searchMode
      bind:removeMode
      fieldRoot={fieldRoot as keyof Resource}
      {joinConfig} />
  {/each}
</div>
