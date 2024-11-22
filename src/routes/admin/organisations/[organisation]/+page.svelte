<script lang="ts">
// CONFIG
import { NEW_TITLE, NEW_REF } from '$lib';
// CONTEXT
import { setForm, getForm } from '$lib/context/forms.svelte';
import { getRouterState } from '$lib/context/router.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
// TYPES
import type { PageProps, FormField, Organisation, EntityRouter } from '$lib/types';

// CONFIG
const RESOURCE = 'organisation';
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
let pageProps: PageProps<Organisation> = $props();
let { validatedForm, entity } = pageProps.data;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// STATE : CONTEXT :: RESOURCES
const resourceState = getHierarchicalResourceState();

// STATE : FORM
let form = $state(setForm<Organisation>(RESOURCE, entity, validatedForm));
let enhance = $derived(form.enhance);
let isNew = $state(entity === NEW_REF);

$effect(() => {
  if (isNew && title !== NEW_TITLE){
    form = setForm<Organisation>(RESOURCE, routerState.entity, pageProps.data.validatedForm)
    entity = routerState.entity;
    isNew = false;
    doRerender++
  } else {
    form = getForm<Organisation>(RESOURCE, entity);
  }
}); 

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.name || NEW_TITLE);

// SYNC :: Update resource state with current entity
$effect(() => {
  resourceState.update('organisation', pageProps.data.validatedForm.data);
});


// SYNC :: Await immediately resolved promise to react to value change.
const forceUpdate = async (_) => {};
let doRerender = $state(0);
</script>

{#await forceUpdate(doRerender) then _}
<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header {title} {form} />
  <form method="POST" use:enhance role="form" data-testid="organisationForm">
    <main class="flex flex-col gap-6 p-6">
      {#if routerState.facet === 'core'}
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
      {:else if routerState.facet === 'images'}
        <ImageSection title="Image" fields={FIELDS.images} {form} />
      {/if}
    </main>
  </form>
</div>
{/await}