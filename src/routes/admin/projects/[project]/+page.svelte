<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { fade } from 'svelte/transition';
import { untrack } from 'svelte';
// LIB
import { NEW_TITLE } from '$lib';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
// ICONS
import { Squares2x2 as ProjectIcon } from '@steeze-ui/heroicons';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// COMPONENTS
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import PropertySection from '$lib/components/forms/sections/PropertyType.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
import Scrollbar from '$lib/components/common/scrollbars/Scrollbar.svelte';
// ENUMS
import {
  FirstClassResource,
  classifierComponentTypes,
  specifierComponentTypes,
  ImageContextResource
} from '$lib/enums';
// TYPES
import type {
  Project,
  FormPageProps,
  FormField,
  FormFieldArray,
  FormFieldArrayDefinition,
  Image,
  Id
} from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// ELEMENTS
let vietportElement: HTMLDivElement | undefined = $state();
let contentsElement: HTMLFormElement | undefined = $state();

// CONFIG
const RESOURCE = FirstClassResource.project;
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
      label: m.feature__description(),
      component: 'TextareaField',
      isArray: false,
      isTranslated: true,
      isNested: false
    }
  } as FormField,
  credit: {
    license: {
      label: m.admin__forms_projects_license(),
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    attribution: {
      label: m.profile__attribution(),
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    }
  } as FormField,
  users: {
    maintainerRoles: {
      label: m.admin__forms_project_members_title(),
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
    }
  } as FormField,
  config: {
    properties: {
      isArray: true,
      discriminators: {
        key: 'type',
        values: ['classifier', 'specifier'],
        specs: {
          classifier: {
            key: {
              label: 'Name in API',
              component: 'InputField',
              isArray: false,
              isTranslated: false,
              isNested: true
            },
            label: {
              label: 'Name in UI',
              component: 'InputField',
              isArray: false,
              isTranslated: true,
              isNested: true
            },
            placeholder: {
              label: 'Input Placeholder',
              component: 'InputField',
              isArray: false,
              isTranslated: true,
              isNested: true
            },
            component: {
              label: 'Component',
              component: 'SelectField',
              values: classifierComponentTypes,
              isArray: false,
              isTranslated: false,
              isNested: true
            },
            values: {
              component: 'ListField',
              isArray: true,
              isTranslated: true,
              isNested: true,
              showForComponent: ['SelectField']
            },
            min: {
              label: 'Minimum',
              component: 'InputField',
              inputType: 'number',
              isArray: false,
              isTranslated: false,
              isNested: true,
              showForComponent: ['RangeField']
            },
            max: {
              label: 'Maximum',
              component: 'InputField',
              inputType: 'number',
              isArray: false,
              isTranslated: false,
              isNested: true,
              showForComponent: ['RangeField']
            }
          },
          specifier: {
            key: {
              label: 'Name in API',
              component: 'InputField',
              isArray: false,
              isNested: true,
              isTranslated: false
            },
            label: {
              label: 'Name in UI',
              component: 'InputField',
              isArray: false,
              isNested: true,
              isTranslated: true
            },
            placeholder: {
              label: 'Input Placeholder',
              component: 'InputField',
              isArray: false,
              isNested: true,
              isTranslated: true
            },
            component: {
              label: 'Component',
              component: 'SelectField',
              values: specifierComponentTypes,
              isArray: false,
              isNested: true,
              isTranslated: false
            }
          }
        }
      }
    } as FormFieldArrayDefinition
  } as FormFieldArray,
  images: {
    image: {
      label: m.admin__forms_project_image_title(),
      component: 'InputField',
      isArray: false
    }
  } as FormField
};

// STATE : PROPS
let pageProps: FormPageProps<Project> = $props();

// Read facet from URL hash
const hashFacet = $derived(() => {
  if (typeof window !== 'undefined') {
    const hash = page.url.hash;
    return hash ? hash.substring(1) : null;
  }
  return null;
});

// Set facet from hash or default to 'core'
$effect(() => {
  const facet = hashFacet();
  if (facet && ['core', 'fields', 'images'].includes(facet)) {
    adminCtx.setFacet(facet as any, pageProps.data.entity, FirstClassResource.project);
  } else {
    adminCtx.setFacet('core', pageProps.data.entity, FirstClassResource.project);
  }
});

// STATE : FORM
let form = setForm(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getAdminCtx(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);

// REACTIVE: Update form when pageProps change (for reset functionality)
watch(
  () => pageProps.data.validatedForm?.data,
  (newData) => {
    form.form.set(newData as unknown as Project);
  },
  {
    lazy: true
  }
);

// STATE : DERIVED
let enhance = $derived(form.enhance);
let title = $derived(
  pageProps.data.validatedForm?.data?.i18n?.[getLocale()]?.name || NEW_TITLE
);
let image = $derived(pageProps.data.image as Image);

// HEADER SETUP
$effect(() => {
  const facetTabs = new Map();
  facetTabs.set('core', m.resources__main());
  facetTabs.set('fields', m.project__fields());
  if (adminCtx.activeResourceRef !== 'new') {
    facetTabs.set('images', m.organisation__images());
  }

  untrack(() => adminCtx.setHeaderForEntity(title, ProjectIcon, facetTabs));

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
    {#await adminCtx.appCtx.getHierarchy(pageProps.data.validatedForm?.data) then { organisation, project }}
      <form
        id="projectForm"
        method="POST"
        use:enhance
        role="form"
        transition:fade
        data-testid="projectForm"
        class="mb-24 h-full overflow-y-auto"
        bind:this={contentsElement}>
        <main
          class="flex flex-col gap-6 p-6 {adminCtx.activeFacet === 'core'
            ? 'min-h-full pb-64'
            : 'h-full'}">
          {#if adminCtx.activeFacet === 'core' || adminCtx.activeFacet === false}
            <I18nSection
              title={m.admin__forms_common_descriptors()}
              fields={FIELDS.i18n}
              {form} />
            <I18nSection
              title={m.admin__forms_project_credit()}
              subtitle={m.admin__forms_project_credit_subtitle()}
              fields={FIELDS.credit}
              {form} />
            <div class="flex flex-row gap-4 pt-4">
              <UserSection
                title={m.admin__forms_project_members_title()}
                subtitle={m.admin__forms_project_members_subtitle()}
                fields={FIELDS.users}
                {form}
                joinConfig={{
                  discriminator: 'role',
                  checkedValue: 'maintainer',
                  uncheckedValue: 'member'
                }} />
              <SpecificationSection
                title={m.admin__forms_common_specifiers()}
                fields={FIELDS.specification as FormField}
                {form} />
            </div>
          {:else if adminCtx.activeFacet === 'fields'}
            <div class="flex flex-col gap-6 pb-[256px]">
              <PropertySection
                title={m.admin__forms_common_classifiers()}
                subtitle={m.admin__forms_common_classifiers_subtitle()}
                fieldDiscriminator="classifier"
                fields={FIELDS.config as FormFieldArray}
                {form} />
              <PropertySection
                title={m.admin__forms_common_specifiers()}
                subtitle={m.admin__forms_common_specifiers_subtitle()}
                fieldDiscriminator="specifier"
                fields={FIELDS.config as FormFieldArray}
                {form} />
            </div>
          {:else if adminCtx.activeFacet === 'images'}
            <ImageProvider
              {page}
              isAdminMode={true}
              context={{
                ctxType: ImageContextResource.project,
                ctxId: (pageProps.data.validatedForm.data as Project).id,
                organisation,
                project
              }}
              {image}>
              <ImageSection
                title={m.admin__forms_project_image_title()}
                fields={FIELDS.images as FormField}
                {image}
                {form} />
            </ImageProvider>
          {/if}
        </main>
      </form>
    {/await}
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
