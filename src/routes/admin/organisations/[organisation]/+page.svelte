<script lang="ts">
import SuperDebug from 'sveltekit-superforms';
import { browser } from '$app/environment';
import { onMount, onDestroy } from 'svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
// TYPES
import type { PageProps, FormField, Organisation, ResourceRouter, NavProps } from '$lib/types';

// CONFIG
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
let { data }: PageProps<Organisation> = $props();
let { validatedForm } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
let title = $derived(data.validatedForm.data.name || 'New');

let navProps: NavProps = $derived({
  resource: routerState.resource,
  entity: data.entity,
  facet: routerState.facet || 'core'
});

// STATE : FORM
let { enhance } = setForm<Organisation>(navProps.resource, navProps.entity, validatedForm);

</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header {title} {...navProps} />
  <form method="POST" use:enhance role="form" data-testid="organisationForm">
    <main class="flex flex-col gap-6 p-6">
      {#if navProps.facet === 'core'}
        <I18nSection title="Descriptors" fields={FIELDS.i18n} {...navProps} />
        <div class="flex flex-row gap-6">
          <UserSection
            title="Members"
            subtitle="Members can be set as Project Maintainers"
            fields={FIELDS.users}
            {...navProps} />
          <SpecificationSection title="Specification" fields={FIELDS.specification} {...navProps} />
        </div>
      {:else if navProps.facet === 'images'}
        <ImageSection title="Image" fields={FIELDS.images} {...navProps} />
      {/if}
      <!-- <SuperDebug data={$form} /> -->
    </main>
  </form>
</div>
