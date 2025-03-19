<script lang="ts">
// CONFIG
import { NEW_TITLE, NEW_REF } from '$lib';
// CONTEXT
import { setForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
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
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';

// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const RESOURCE = HierarchicalResource.organisation;
const FIELDS: Record<string, FormField> = {
  i18n: {
    name: {
      label: 'Full Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    nameShort: {
      label: 'Short Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    description: {
      label: 'Description',
      component: 'TextareaField',
      isArray: false,
      isTranslated: true,
      isNested: false
    }
  },
  users: {
    userRoles: {
      label: 'Members',
      isArray: true,
      isTranslated: false,
      isNested: false
    }
  },
  specification: {
    code: {
      label: 'Code',
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    },
    url: {
      label: 'URL',
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    }
  },
  images: {
    image: {
      label: 'Profile Image',
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    }
  }
};

// STATE : PROPS
let pageProps: FormPageProps<Organisation> = $props();

// STATE : FORM
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
        <I18nSection title="Descriptors" fields={FIELDS.i18n} {form} />
        <div class="flex flex-row gap-6">
          <UserSection
            title="Members"
            subtitle="Members can be set as Project Maintainers"
            fields={FIELDS.users}
            {form} />
          <SpecificationSection
            title="Specification"
            fields={FIELDS.specification}
            {form} />
        </div>
      {:else if resourceState.activeFacet === 'images'}
        <ImageSection
          title="Image"
          fields={FIELDS.images}
          {form}
          image={pageProps.data.image as GetImageAPI} />
      {/if}
    </main>
  </form>
</div>
