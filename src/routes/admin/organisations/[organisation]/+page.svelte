<script lang="ts">
// CONFIG
import { NEW_TITLE, NEW_REF } from '$lib';
// CONTEXT
import { setForm, getForm } from '$lib/context/forms.svelte';
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

// STATE : CONTEXT :: RESOURCES
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
let { validatedForm, entity } = pageProps.data;

// STATE : FORM
let form = $state(setForm<Organisation>(RESOURCE, entity, validatedForm));
let enhance = $derived(form.enhance);
let isNew = $state(entity === NEW_REF);

$effect(() => {
  if (isNew && title !== NEW_TITLE) {
    form = setForm<Organisation>(
      RESOURCE,
      resourceState.activeEntity as string,
      pageProps.data.validatedForm
    );
    entity = resourceState.activeEntity as string;
    isNew = false;
    // doRerender++;
  } else {
    form = getForm<Organisation>(RESOURCE, entity);
  }
});

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.name || NEW_TITLE);

// SYNC :: Update resource state with current entity
// $effect(() => {
// resourceState.setEntity(entity, RESOURCE);
// });

// SYNC :: Await immediately resolved promise to react to value change.
// const forceUpdate = async (_) => {};
// let doRerender = $state(0);
</script>

<!-- {#await forceUpdate(doRerender) then _} -->
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
<!-- {/await} -->
