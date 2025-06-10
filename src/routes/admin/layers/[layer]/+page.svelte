<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { fade } from 'svelte/transition';
// LIB
import { NEW_TITLE } from '$lib';
// I18N
import { m } from '$lib/i18n';
import { getLocale } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import HeaderButton from '$lib/components/layout/HeaderButton.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import LayerPropertySection from '$lib/components/forms/sections/LayerProperty.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type {
  Layer,
  FormPageProps,
  FormField,
  FormFieldArray,
  FormFieldArrayDefinition
} from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// CONFIG
const FIELDS: Record<string, FormField | FormFieldArray> = {
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
  property: {
    properties: {
      isArray: true,
      discriminators: {
        key: 'type',
        values: ['classifier', 'specifier'],
        specs: {
          classifier: {},
          specifier: {}
        }
      }
    } as FormFieldArrayDefinition
  } as FormFieldArray
};

// STATE : PROPS
let pageProps: FormPageProps<Layer> = $props();
adminCtx.setEntity(pageProps.data.entity, FirstClassResource.layer);
adminCtx.setFacet('core');

// STATE : FORM
let form = setForm(
  FirstClassResource.layer,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getAdminCtx(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);

// REACTIVE: Update form when pageProps change (for reset functionality)
watch(
  () => pageProps.data.validatedForm.data,
  (newData) => {
    form.form.set(newData as unknown as Layer);
  },
  {
    lazy: true
  }
);

// STATE : DERIVED :: TITLE
let enhance = $derived(form.enhance);
let title = $derived(
  pageProps.data.validatedForm?.data?.i18n?.[getLocale()]?.name || NEW_TITLE
);
</script>

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title}>
    {#snippet menuItems()}
      <HeaderButton
        facet={{ label: m.layer__core(), ref: 'core' }}
        isActive={adminCtx.activeFacet === 'core' || adminCtx.activeFacet === false} />
    {/snippet}

    {#snippet actions()}
      <EntityActions {form} />
    {/snippet}
  </Header>
  {#if adminCtx.appCtx.isInitialised}
    <form
      id="layerForm"
      method="POST"
      use:enhance
      role="form"
      data-testid="layerForm"
      transition:fade
      class="h-full">
      <main class="flex h-full flex-col gap-6 overflow-y-auto p-6">
        {#if adminCtx.activeFacet === 'core' || adminCtx.activeFacet === false}
          <I18nSection
            title={m.admin__forms_common_descriptors()}
            fields={FIELDS.i18n as FormField}
            {form} />
          <div class="flex flex-row gap-6">
            <LayerPropertySection
              title={m.admin__forms_common_classifiers()}
              subtitle={m.admin__forms_common_classifiers_subtitle()}
              fieldDiscriminator="classifier"
              fields={FIELDS.property as FormField & FormFieldArray}
              {form} />
            <LayerPropertySection
              title={m.admin__forms_common_specifiers()}
              subtitle={m.admin__forms_common_specifiers_subtitle()}
              fieldDiscriminator="specifier"
              fields={FIELDS.property as FormField & FormFieldArray}
              {form} />
          </div>
        {/if}
      </main>
    </form>
  {/if}
</div>
