<script lang="ts">
// LIB
import { NEW_TITLE } from '$lib';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
import { getHeaderCtrl } from '$lib/context/header.svelte';
// ICONS
import HubIcon from 'virtual:icons/lucide/building-2';
// COMPONENTS
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import HubOrganisationsSection from '$lib/components/forms/sections/HubOrganisations.svelte';
import Scrollbar from '$lib/components/common/scrollbars/Scrollbar.svelte';
// TYPES
import type { Hub, FormPageProps, FormField } from '$lib/types';
import { untrack } from 'svelte';

// CONTEXT
const adminCtx = getAdminCtx();
const headerCtrl = getHeaderCtrl();

// ELEMENTS
let vietportElement: HTMLDivElement | undefined = $state();
let contentsElement: HTMLFormElement | undefined = $state();

// CONFIG
const RESOURCE = 'hub' as any;
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
adminCtx.setFacet('core', pageProps.data.entity, RESOURCE);

// STATE : FORM
let form = setForm(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getAdminCtx()
);
let enhance = $derived(form.enhance);

// STATE : DERIVED :: TITLE
let title = $derived(
  pageProps.data.validatedForm?.data?.i18n?.[getLocale()]?.name || NEW_TITLE
);

// HEADER SETUP
$effect(() => {
  const facetTabs = new Map();
  facetTabs.set('core', m.resources__main());

  untrack(() => headerCtrl.setHeaderForEntity(title, HubIcon, facetTabs));

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

<!-- LAYOUT -->
<div class="relative h-full w-full overflow-hidden" bind:this={vietportElement}>
  <form
    id="hubForm"
    method="POST"
    use:enhance
    role="form"
    data-testid="hubForm"
    class="mb-24 h-full overflow-y-auto"
    bind:this={contentsElement}>
    <main class="flex min-h-full flex-col gap-6 p-6 pb-64">
      <I18nSection
        title={m.admin__forms_common_descriptors()}
        fields={FIELDS.i18n}
        {form} />
      <div class="flex flex-row gap-6">
        <HubOrganisationsSection
          title={m.hub__organisations()}
          subtitle={m.hub__organisations_note()}
          fields={{
            organisations: {
              label: 'Hub Organisations',
              component: 'InputField',
              isArray: false,
              isTranslated: false,
              isNested: false
            }
          } as FormField}
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
      </div>
    </main>
  </form>
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
