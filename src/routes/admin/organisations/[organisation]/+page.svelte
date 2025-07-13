<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { fade } from 'svelte/transition';
import { untrack } from 'svelte';
// CONFIG
import { NEW_TITLE } from '$lib';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
// ICONS
import { Users as OrganisationIcon } from '@steeze-ui/heroicons';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// COMPONENTS
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
import OrganisationHubActions from '$lib/components/forms/actions/OrganisationHub.svelte';
import Scrollbar from '$lib/components/common/scrollbars/Scrollbar.svelte';
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums';
// TYPES
import type { FormPageProps, FormField, Organisation, Image, Id } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// ELEMENTS
let vietportElement: HTMLDivElement | undefined = $state();
let contentsElement: HTMLFormElement | undefined = $state();

// CONFIG
const RESOURCE = FirstClassResource.organisation;
const FIELDS: Record<string, FormField> = {
  i18n: {
    name: {
      label: m.admin__forms_common_name_full(),
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    nameShort: {
      label: m.admin__forms_common_name_short(),
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    description: {
      label: m.feature__description(),
      component: 'TextareaField',
      isArray: false,
      isTranslated: true,
      isNested: false
    }
  } as FormField,
  users: {
    userRoles: {
      label: m.admin__forms_organisation_members_title(),
      isArray: true,
      isTranslated: false,
      isNested: false
    }
  } as FormField,
  specification: {
    code: {
      label: m.admin__forms_common_code(),
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    },
    url: {
      label: m.admin__forms_organisation_url(),
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    }
  } as FormField,
  images: {
    image: {
      label: m.admin__forms_organisation_image_title(),
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    }
  } as FormField
};

// STATE : PROPS
let pageProps: FormPageProps<Organisation> = $props();

// Read facet from URL hash
const hashFacet = $derived(() => {
  if (typeof window !== 'undefined') {
    const hash = page.url.hash;
    return hash ? hash.substring(1) : null;
  }
  return null;
});

// Set facet from hash or default to 'core'
$effect(() => {
  const facet = hashFacet();
  if (facet && ['core', 'images'].includes(facet)) {
    adminCtx.setFacet(
      facet as any,
      pageProps.data.entity,
      FirstClassResource.organisation
    );
  } else {
    adminCtx.setFacet('core', pageProps.data.entity, FirstClassResource.organisation);
  }
});

let form = setForm(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getAdminCtx(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);

// REACTIVE: Update form when pageProps change (for reset functionality)
watch(
  () => pageProps.data.validatedForm.data,
  (newData) => {
    form.form.set(newData as unknown as Organisation);
  },
  {
    lazy: true
  }
);

// STATE : DERIVED
let enhance = $derived(form.enhance);
let title = $derived(
  pageProps.data.validatedForm?.data?.i18n?.[getLocale()]?.name || NEW_TITLE
);
let image = $derived(pageProps.data.image as Image);
let { form: organisationForm } = form;

let headerActions = $derived(
  $organisationForm.hubId ? organisationHubActionSnippet : undefined
);

// HEADER SETUP
$effect(() => {
  const facetTabs = new Map();
  facetTabs.set('core', m.resources__main());
  if (adminCtx.activeResourceRef !== 'new') {
    facetTabs.set('images', m.organisation__images());
  }

  untrack(() => adminCtx.setHeaderForEntity(title, OrganisationIcon, facetTabs));

  // Set form context for header actions
  adminCtx.appCtx.setFormContext(form);
});

// Clean up form context when component unmounts
$effect(() => {
  return () => {
    adminCtx.appCtx.clearFormContext();
  };
});
</script>

{#snippet organisationHubActionSnippet()}
  <OrganisationHubActions {form} />
{/snippet}

<!-- LAYOUT -->
<div class="relative h-full w-full overflow-hidden" bind:this={vietportElement}>
  {#if adminCtx.appCtx.isInitialised}
    <form
      id="organisationForm"
      method="POST"
      use:enhance
      role="form"
      data-testid="organisationForm"
      transition:fade
      class="mb-24 h-full overflow-y-auto"
      bind:this={contentsElement}>
      <main
        class="flex flex-col gap-6 p-6 {adminCtx.activeFacet === 'core'
          ? 'min-h-full pb-64'
          : 'h-full'}">
        {#if adminCtx.activeFacet === 'core' || adminCtx.activeFacet === false}
          <I18nSection
            title={m.admin__forms_common_descriptors()}
            fields={FIELDS.i18n}
            {form}
            {headerActions} />
          <div class="flex flex-row gap-6">
            <UserSection
              title={m.admin__forms_organisation_members_title()}
              subtitle={m.admin__forms_organisation_members_subtitle()}
              fields={FIELDS.users}
              {form}
              joinConfig={{
                discriminator: 'role',
                checkedValue: 'owner',
                uncheckedValue: 'member'
              }} />
            <SpecificationSection
              title={m.admin__forms_common_specifiers()}
              fields={FIELDS.specification}
              {form} />
          </div>
        {:else if adminCtx.activeFacet === 'images'}
          <div class="flex- flex h-full">
            <ImageProvider
              {page}
              isAdminMode={true}
              {image}
              context={{
                ctxType: ImageContextResource.organisation,
                ctxId: (pageProps.data.validatedForm.data as Organisation).id,
                organisation: pageProps.data.validatedForm.data as Organisation
              }}>
              <ImageSection
                title={m.admin__forms_organisation_image_title()}
                fields={FIELDS.images}
                {image}
                {form} />
            </ImageProvider>
          </div>
        {/if}
      </main>
    </form>
  {/if}
  {#if vietportElement && contentsElement}
    <Scrollbar
      viewport={vietportElement}
      contents={contentsElement}
      showThumbOnTrackEnter={true}
      margin={{
        top: 8,
        bottom: 0
      }}
      width={{
        track: 24,
        thumb: 8,
        thumbActive: 12
      }} />
  {/if}
</div>
