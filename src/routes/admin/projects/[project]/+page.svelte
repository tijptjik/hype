<script lang="ts">
import { goto } from '$app/navigation';
import { NEW_TITLE, NEW_REF } from '$lib';
import { get } from 'svelte/store';
// CONTEXT
import { setForm, getForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import PropertySection from '$lib/components/forms/sections/Property.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
// CONFIG
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { Project } from '$lib/types';
import type { FormPageProps, FormField, FormFieldArray, GetImageAPI } from '$lib/types';

// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const RESOURCE = HierarchicalResource.project;
const FIELDS: Record<string, FormField | FormFieldArray> = {
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
  credit: {
    license: {
      label: 'License',
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    attribution: {
      label: 'Attribution',
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    }
  },
  users: {
    maintainerRoles: {
      label: 'Maintainers',
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
      label: 'Banner Image',
      component: 'InputField',
      isArray: false
    }
  }
};

// STATE : PROPS
let pageProps: FormPageProps<Project> = $props();

// STATE : FORM
let form = setForm<Project>(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState()
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
        <I18nSection title="Descriptors" fields={FIELDS.i18n as FormField} {form} />
        <I18nSection
          title="Credit"
          subtitle="Under which licence (e.g. <code>CC-BY-SA</code> or <code>Copyrighted</code>) is this project published, and how should it be attributed?"
          fields={FIELDS.credit as FormField}
          {form} />
        <div class="flex flex-row gap-6">
          <UserSection
            title="Members with Edit Access"
            subtitle="Maintainers have access to the review queue and can accept or reject feature changes"
            fields={FIELDS.users as FormFieldArray}
            {form} />
          <SpecificationSection
            title="Specification"
            fields={FIELDS.specification as FormField}
            {form} />
        </div>
      {:else if resourceState.activeFacet === 'fields'}
        <div class="flex flex-col gap-6">
          <PropertySection
            title="Categorical Fields"
            subtitle="by which features can be filtered"
            fieldDiscriminator="classifier"
            fields={FIELDS.config as FormFieldArray}
            {form} />
          <PropertySection
            title="Freeform Fields"
            subtitle="displayed in a feature's info panels"
            fieldDiscriminator="specifier"
            fields={FIELDS.config as FormFieldArray}
            {form} />
        </div>
      {:else if resourceState.activeFacet === 'images'}
        <ImageSection
          title="Image"
          fields={FIELDS.images}
          {form}
          image={pageProps.data.image as GetImageAPI} />
      {/if}
    </main>
  </form>
</div>
