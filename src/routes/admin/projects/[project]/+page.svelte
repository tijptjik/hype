<script lang="ts">
// SVELTE
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
// LIB
import { NEW_TITLE, NEW_REF } from '$lib';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { setForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import PropertySection from '$lib/components/forms/sections/Property.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
// ENUMS
import {
  HierarchicalResource,
  classifierComponentTypes,
  specifierComponentTypes
} from '$lib/types';
// TYPES
import type {
  Project,
  FormPageProps,
  FormField,
  FormFieldArray,
  GetImageAPI
} from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const RESOURCE = HierarchicalResource.project;
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
  },
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
  },
  users: {
    maintainerRoles: {
      label: m.admin__forms_project_members_title(),
      isArray: true,
      isTranslated: false,
      isNested: false
    }
  },
  specification: {
    code: {
      label: m.admin__forms_common_code(),
      component: 'InputField',
      isArray: false,
      isTranslated: false,
      isNested: false
    }
  },
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
            // TODO: Add support for translatable specifiers
            // isTranslatable: {
            //   label: 'Translatable',
            //   component: 'ToggleField',
            //   isArray: false,
            //   isNested: true,
            //   isTranslated: false
            // }
          }
        }
      }
    }
  },
  images: {
    image: {
      label: m.admin__forms_project_image_title(),
      component: 'InputField',
      isArray: false
    }
  }
};

// STATE : PROPS
let pageProps: FormPageProps<Project> = $props();
resourceState.setEntity(pageProps.data.entity, RESOURCE);
resourceState.setFacet('core');

// STATE : FORM
let form = setForm<Project>(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);
let enhance = $derived(form.enhance);

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.name || NEW_TITLE);
</script>

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title} {form} />
  <form method="POST" use:enhance role="form" data-testid="projectForm" class="h-full">
    <main class="flex h-full flex-col gap-6 overflow-y-scroll p-6">
      {#if resourceState.activeFacet === 'core' || resourceState.activeFacet === false}
        <I18nSection
          title={m.admin__forms_common_descriptors()}
          fields={FIELDS.i18n as FormField}
          {form} />
        <I18nSection
          title={m.admin__forms_project_credit()}
          subtitle={m.admin__forms_project_credit_subtitle()}
          fields={FIELDS.credit as FormField}
          {form} />
        <div class="flex flex-row gap-6">
          <UserSection
            title={m.admin__forms_project_members_title()}
            subtitle={m.admin__forms_project_members_subtitle()}
            fields={FIELDS.users as FormFieldArray}
            {form} />
          <SpecificationSection
            title={m.admin__forms_common_specifiers()}
            fields={FIELDS.specification as FormField}
            {form} />
        </div>
      {:else if resourceState.activeFacet === 'fields'}
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
      {:else if resourceState.activeFacet === 'images'}
        <ImageProvider
          mode="standalone"
          isAdminMode={true}
          refType={RESOURCE}
          refId={pageProps.data.entity}
          refOrganisation={resourceState.getOrganisation(
            resourceState.getEntity() as Project
          )}
          refProject={resourceState.getEntity() as Project}
          image={pageProps.data.image as GetImageAPI}>
          <ImageSection
            title={m.admin__forms_project_image_title()}
            fields={FIELDS.images}
            {form} />
        </ImageProvider>
      {/if}
    </main>
  </form>
</div>
