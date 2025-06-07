<script lang="ts">
// LIB
import { NEW_TITLE } from '$lib';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import HeaderButton from '$lib/components/layout/HeaderButton.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import HubOrganisationsSection from '$lib/components/forms/sections/HubOrganisations.svelte';
// TYPES
import type { Hub, FormPageProps, FormField } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const RESOURCE = 'hub' as any;
const FIELDS: Record<string, FormField> = {
  specification: {
    code: {
      label: m.admin__forms_common_code(),
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    },
    domain: {
      label: 'Domain',
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    }
  } as FormField
};

// STATE : PROPS
let pageProps: FormPageProps<Hub> = $props();
resourceState.setEntity(pageProps.data.entity, RESOURCE);
resourceState.setFacet('core');

// STATE : FORM
let form = setForm(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);
let enhance = $derived(form.enhance);

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm?.data?.code || NEW_TITLE);
</script>

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title}>
    {#snippet menuItems()}
      <HeaderButton
        facet={{ label: m.organisation__core(), ref: 'core' }}
        isActive={resourceState.activeFacet === 'core' ||
          resourceState.activeFacet === false} />
    {/snippet}

    {#snippet actions()}
      <EntityActions {form} />
    {/snippet}
  </Header>
  <form
    id="hubForm"
    method="POST"
    use:enhance
    role="form"
    data-testid="hubForm"
    class="h-full">
    <main class="flex flex-row gap-6 overflow-y-auto p-6">
      <HubOrganisationsSection
        title="Hub Organisations"
        subtitle="Manage which organisations belong to this hub"
        fields={{ organisations: { label: 'Hub Organisations', component: 'InputField', isArray: false, isTranslated: false, isNested: false } } as FormField}
        {form}
        joinConfig={{
          discriminator: 'isCoreInclusive',
          checkedValue: true,
          uncheckedValue: false
        }} />
      <SpecificationSection
        title={m.admin__forms_common_specifiers()}
        fields={FIELDS.specification as FormField}
        {form} />
    </main>
  </form>
</div>
