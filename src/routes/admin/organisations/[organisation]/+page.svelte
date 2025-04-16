<script lang="ts">
// CONFIG
import { NEW_TITLE, NEW_REF } from '$lib';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { FormPageProps, FormField, Organisation, GetImageAPI } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const RESOURCE = HierarchicalResource.organisation;
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
  },
  users: {
    userRoles: {
      label: m.admin__forms_organisation_members_title(),
      isArray: true,
      isTranslated: false,
      isNested: false
    }
  },
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
  },
  images: {
    image: {
      label: m.admin__forms_organisation_image_title(),
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    }
  }
};

// STATE : PROPS
let pageProps: FormPageProps<Organisation> = $props();
let form = setForm<Organisation>(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);
let enhance = $derived(form.enhance);

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.name || NEW_TITLE);
</script>

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title} {form} />
  <form
    method="POST"
    use:enhance
    role="form"
    data-testid="organisationForm"
    class="h-full">
    <main class="flex h-full flex-col gap-6 overflow-y-scroll p-6">
      {#if resourceState.activeFacet === 'core' || resourceState.activeFacet === false}
        <I18nSection
          title={m.admin__forms_common_descriptors()}
          fields={FIELDS.i18n}
          {form} />
        <div class="flex flex-row gap-6">
          <UserSection
            title={m.admin__forms_organisation_members_title()}
            subtitle={m.admin__forms_organisation_members_subtitle()}
            fields={FIELDS.users}
            {form} />
          <SpecificationSection
            title={m.admin__forms_common_specifiers()}
            fields={FIELDS.specification}
            {form} />
        </div>
      {:else if resourceState.activeFacet === 'images'}
        <ImageProvider
          mode="standalone"
          isAdminMode={true}
          refType={RESOURCE}
          refId={pageProps.data.entity}
          refOrganisation={resourceState.getEntity() as Organisation}
          image={pageProps.data.image as GetImageAPI}>
          <ImageSection
            title={m.admin__forms_organisation_image_title()}
            fields={FIELDS.images}
            {form} />
        </ImageProvider>
      {/if}
    </main>
  </form>
</div>
