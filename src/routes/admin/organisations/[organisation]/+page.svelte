<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { fade } from 'svelte/transition';
// CONFIG
import { NEW_TITLE } from '$lib';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import HeaderButton from '$lib/components/layout/HeaderButton.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
import OrganisationHubActions from '$lib/components/forms/actions/OrganisationHub.svelte';
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums';
// TYPES
import type { FormPageProps, FormField, Organisation, Image } from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

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
      label: m.admin__forms_common_description(),
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
adminCtx.setEntity(pageProps.data.entity, FirstClassResource.organisation);
adminCtx.setFacet('core');

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
let { form: organisationForm } = form;

let headerActions = $derived(
  !!$organisationForm.hubId ? organisationHubActionSnippet : undefined
);
</script>

{#snippet organisationHubActionSnippet()}
  <OrganisationHubActions {form} />
{/snippet}

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title}>
    {#snippet menuItems()}
      <HeaderButton
        facet={{ label: m.organisation__core(), ref: 'core' }}
        isActive={adminCtx.activeFacet === 'core' || adminCtx.activeFacet === false} />
      {#if adminCtx.activeEntity !== 'new'}
        <HeaderButton
          facet={{ label: m.organisation__images(), ref: 'images' }}
          isActive={adminCtx.activeFacet === 'images'} />
      {/if}
    {/snippet}
    {#snippet actions()}
      <EntityActions {form} />
    {/snippet}
  </Header>
  {#if adminCtx.appCtx.isInitialised}
    <form
      id="organisationForm"
      method="POST"
      use:enhance
      role="form"
      data-testid="organisationForm"
      transition:fade
      class="h-full">
      <main class="flex h-full flex-col gap-6 overflow-y-auto p-6">
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
          <ImageProvider
            mode="standalone"
            isAdminMode={true}
            ctxType={ImageContextResource.organisation}
            ctxId={pageProps.data.entity}
            organisation={adminCtx.getEntity() as Organisation}
            image={pageProps.data.image as Image}>
            <ImageSection
              title={m.admin__forms_organisation_image_title()}
              fields={FIELDS.images}
              image={pageProps.data.image as Image}
              {form} />
          </ImageProvider>
        {/if}
      </main>
    </form>
  {/if}
</div>
