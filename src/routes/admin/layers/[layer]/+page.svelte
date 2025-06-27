<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { fade } from 'svelte/transition';
import { untrack } from 'svelte';
// LIB
import { NEW_TITLE } from '$lib';
// I18N
import { m } from '$lib/i18n';
import { getLocale } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
// ICONS
import { Square3Stack3d as LayerIcon } from '@steeze-ui/heroicons';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// COMPONENTS
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import LayerPropertySection from '$lib/components/forms/sections/LayerProperty.svelte';
import Scrollbar from '$lib/components/common/scrollbars/Scrollbar.svelte';
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

// ELEMENTS
let vietportElement: HTMLDivElement | undefined = $state();
let contentsElement: HTMLFormElement | undefined = $state();

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
adminCtx.setFacet('core', pageProps.data.entity, FirstClassResource.layer);

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

// HEADER SETUP
$effect(() => {
  const facetTabs = new Map();
  facetTabs.set('core', m.layer__core());

  untrack(() => adminCtx.setHeaderForEntity(title, LayerIcon, facetTabs));

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
  {#if adminCtx.appCtx.isInitialised}
    <form
      id="layerForm"
      method="POST"
      use:enhance
      role="form"
      data-testid="layerForm"
      transition:fade
      class="mb-12 h-full overflow-y-auto"
      bind:this={contentsElement}>
      <main
        class="flex flex-col gap-6 p-6 {adminCtx.activeFacet === 'core'
          ? 'min-h-full pb-32'
          : 'h-full'}">
        <I18nSection
          title={m.admin__forms_common_descriptors()}
          fields={FIELDS.i18n as FormField}
          {form} />
        <div class="flex flex-row gap-4">
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
      </main>
    </form>
  {/if}
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
