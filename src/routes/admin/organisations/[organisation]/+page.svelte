<script lang="ts">
// CONFIG
import { NEW_TITLE } from '$lib';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
import { get } from 'svelte/store';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import HeaderButton from '$lib/components/layout/HeaderButton.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
// ENUMS
import { HierarchicalResource, ImageContextResource } from '$lib/enums';
// TYPES
import type { FormPageProps, FormField, Organisation, Image, OrganisationNew } from '$lib/types';

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
  } as FormField,
};

// STATE : PROPS
let pageProps: FormPageProps<Organisation> = $props();
resourceState.setEntity(pageProps.data.entity, RESOURCE);
resourceState.setFacet('core');

let form = setForm(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);
let enhance = $derived(form.enhance);

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm?.data?.i18n?.[getLocale()]?.name || NEW_TITLE);

// STATE : HUB ACTIONS
let isHubExclusiveLoading = $state(false);
let isCoreInclusiveLoading = $state(false);

// DERIVED : HUB STATUS
let hasHub = $derived(!!pageProps.data.validatedForm?.data?.hubId);
let isSuperAdmin = $derived(page.data.session?.user?.superAdmin);
let showHubExclusive = $derived(hasHub);
let showCoreInclusive = $derived(hasHub && isSuperAdmin);

// ACTIONS : HUB PATCHES
const updateHubSetting = async (field: string, value: boolean, setLoading: (loading: boolean) => void) => {
  const organisationCode = pageProps.data.entity;
  if (!organisationCode) return;

  setLoading(true);
  try {
    const response = await fetch(`/api/organisations/${organisationCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });

    if (!response.ok) throw new Error(`Failed to update ${field}`);

    const result = await response.json();
    if (result && result.type === 'success') {
      // Update form data
      const currentFormData = get(form.form);
      form.reset({
        keepMessage: true,
        data: {
          ...currentFormData,
          [field]: result.data[field]
        },
        newState: {
          ...currentFormData,
          [field]: result.data[field]
        }
      });
    }
  } catch (err) {
    console.error(`Failed to update ${field}:`, err);
  } finally {
    setLoading(false);
  }
};

const toggleHubExclusive = () => {
  const currentValue = pageProps.data.validatedForm?.data?.isHubExclusive;
  updateHubSetting('isHubExclusive', !currentValue, (loading) => {
    isHubExclusiveLoading = loading;
  });
};

const toggleCoreInclusive = () => {
  const currentValue = pageProps.data.validatedForm?.data?.isCoreInclusive;
  updateHubSetting('isCoreInclusive', !currentValue, (loading) => {
    isCoreInclusiveLoading = loading;
  });
};
</script>

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title}>
    {#snippet menuItems()}
      <HeaderButton 
        facet={{ label: m.organisation__core(), ref: 'core' }} 
        isActive={resourceState.activeFacet === 'core' || resourceState.activeFacet === false} />
      {#if resourceState.activeEntity !== 'new'}
        <HeaderButton 
          facet={{ label: m.organisation__images(), ref: 'images' }} 
          isActive={resourceState.activeFacet === 'images'} />
      {/if}
    {/snippet}
    
    {#snippet actions()}
      <EntityActions {form} />
    {/snippet}
  </Header>
  <form
    id="organisationForm"
    method="POST"
    use:enhance
    role="form"
    data-testid="organisationForm"
    class="h-full">
    <main class="flex h-full flex-col gap-6 overflow-y-auto p-6">
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
          {#if showHubExclusive || showCoreInclusive}
            <div class="flex flex-col gap-4">
              <h3 class="text-lg font-medium">Hub Settings</h3>
              {#if showHubExclusive}
                <button
                  type="button"
                  class="btn border-none transition-colors duration-500"
                  class:bg-orange-500={!pageProps.data.validatedForm?.data?.isHubExclusive}
                  class:bg-orange-900={pageProps.data.validatedForm?.data?.isHubExclusive}
                  class:text-white={pageProps.data.validatedForm?.data?.isHubExclusive}
                  onclick={toggleHubExclusive}
                  disabled={isHubExclusiveLoading}>
                  {#if isHubExclusiveLoading}
                    <span class="loading loading-ring loading-sm"></span>
                  {:else}
                    {pageProps.data.validatedForm?.data?.isHubExclusive ? 'Hub Shared' : 'Hub Exclusive'}
                  {/if}
                </button>
              {/if}
              {#if showCoreInclusive}
                <button
                  type="button"
                  class="btn border-none transition-colors duration-500"
                  class:bg-blue-500={!pageProps.data.validatedForm?.data?.isCoreInclusive}
                  class:bg-blue-900={pageProps.data.validatedForm?.data?.isCoreInclusive}
                  class:text-white={pageProps.data.validatedForm?.data?.isCoreInclusive}
                  onclick={toggleCoreInclusive}
                  disabled={isCoreInclusiveLoading}>
                  {#if isCoreInclusiveLoading}
                    <span class="loading loading-ring loading-sm"></span>
                  {:else}
                    {pageProps.data.validatedForm?.data?.isCoreInclusive ? 'Core Visible' : 'Core Hidden'}
                  {/if}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {:else if resourceState.activeFacet === 'images'}
        <ImageProvider
          mode="standalone"
          isAdminMode={true}
          ctxType={ImageContextResource.organisation}
          ctxId={pageProps.data.entity}
          organisation={resourceState.getEntity() as Organisation}
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
</div>
