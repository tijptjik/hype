<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { fade } from 'svelte/transition';
// LIB
import { NEW_TITLE } from '$lib';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// COMPONENTS
import Header from '$lib/components/resources/headers/EntityHeader.svelte';
import HeaderButton from '$lib/components/layout/HeaderButton.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import PropertySection from '$lib/components/forms/sections/PropertyType.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
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
      label: m.admin__forms_common_description(),
      component: 'TextareaField',
      isArray: false,
      isTranslated: true,
      isNested: false
    }
  } as FormField,
  credit: {
    license: {
      label: m.admin__forms_project_license(),
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    attribution: {
      label: m.admin__forms_project_attribution(),
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
  () => pageProps.data.validatedForm.data,
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
</script>

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title}>
    {#snippet menuItems()}
      <HeaderButton
        facet={{ label: m.project__core(), ref: 'core' }}
        isActive={adminCtx.activeFacet === 'core' || adminCtx.activeFacet === false} />
      <HeaderButton
        facet={{ label: m.project__fields(), ref: 'fields' }}
        isActive={adminCtx.activeFacet === 'fields'} />
      {#if adminCtx.activeResourceRef !== 'new'}
        <HeaderButton
          facet={{ label: m.project__images(), ref: 'images' }}
          isActive={adminCtx.activeFacet === 'images'} />
      {/if}
    {/snippet}

    {#snippet actions()}
      <EntityActions {form} />
    {/snippet}
  </Header>
  {#if adminCtx.appCtx.isInitialised}
    {#await adminCtx.appCtx.getHierarchy(pageProps.data.validatedForm.data) then { organisation, project }}
      <form
        id="projectForm"
        method="POST"
        use:enhance
        role="form"
        transition:fade
        data-testid="projectForm"
        class="h-full">
        <main class="flex h-full flex-col gap-6 overflow-y-auto p-6">
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
            <div class="flex flex-row gap-6">
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
            <div class="flex flex-col gap-6">
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
              mode="standalone"
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
</div>
