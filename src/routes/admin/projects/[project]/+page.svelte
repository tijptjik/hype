<script lang="ts">
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/FormSectionI18n.svelte';
import SpecificationSection from '$lib/components/forms/FormSectionSpecification.svelte';
import ImageSection from '$lib/components/forms/FormSectionImage.svelte';
import PropertySection from '$lib/components/forms/FormSectionProperty.svelte';
import UserSection from '$lib/components/forms/FormSectionUser.svelte';
// CONFIG
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';
// TYPES
import type { SuperValidated } from 'sveltekit-superforms';
import type { Project } from '$lib/types';
import type {
  FormFieldArray,
  FormFieldConfig,
  ResourceType,
  ResourceRouter,
  FalsableFacetType,
  FormField,
} from '$lib/types';

import SuperDebug from 'sveltekit-superforms';

// TYPES
type Props = {
  data: {
    validatedForm: SuperValidated<Project>;
    entity: string
  }
}

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    name: {
      label: 'Full Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true
    },
    nameShort: {
      label: 'Short Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true
    },
    description: {
      label: 'Description',
      component: 'TextareaField',
      isArray: false,
      isTranslated: true
    }
  },
  credit: {
    license: {
      label: 'License',
      component: 'InputField',
      isArray: false,
      isTranslated: true
    },
    attribution: {
      label: 'Attribution',
      component: 'InputField',
      isArray: false,
      isTranslated: true
    }
  },
  users: {
    maintainerRoles: {
      label: 'Maintainers',
      isArray: true,
      isTranslated: false
    }
  },
  specification: {
    code: {
      label: 'Code',
      component: 'InputField',
      isArray: false,
      isTranslated: false
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
              component: 'ComplexField',
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
let { data }: Props = $props();
let { validatedForm, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
const title = $derived(data.validatedForm.data.name || 'New');

$effect(() => {
  //Remove parentRef from URL if it exists
  const url = new URL(window.location.href);
  url.searchParams.delete('parentRef');
  // shallow navigation
  goto(url.toString(), { replaceState: true });
}); 

// STATE : FORM
let { message, enhance, form } = setForm(
  routerState.resource as ResourceType,
  entity,
  validatedForm
);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header entity={data.entity} resourceType={routerState.resource} {title} />
  <main class="flex w-full flex-col p-6">
    {#if Object.keys(message).length > 0}<h3>{get(message)}</h3>{/if}
    <form method="POST" use:enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <I18nSection
          title="Descriptors"
          fields={FIELDS.i18n as FormField}
          facet={routerState.facet}
          {entity}
          resourceType={routerState.resource} />
        <I18nSection
          title="Credit"
          fields={FIELDS.credit as FormField}
          facet={routerState.facet}
          {entity}
          resourceType={routerState.resource} />
        <div class="flex flex-row gap-6">
          <UserSection
            title="Members with Edit Access"
            subtitle="Maintainers have access to the review queue and can accept or reject feature changes"
            fields={FIELDS.users as FormField}
            facet={routerState.facet}
            {entity}
            resourceType={routerState.resource} />
          <SpecificationSection
            title="Specification"
            fields={FIELDS.specification as FormField}
            facet={routerState.facet}
            {entity}
            resourceType={routerState.resource} />
        </div>
      {:else if routerState.facet === 'fields'}
        <PropertySection
          title="Categorical Fields"
          subtitle="by which features can be filtered"
          fieldId="properties"
          fieldDiscriminator="classifier"
          fields={FIELDS.config as FormFieldArray}
          facet={routerState.facet}
          {entity}
          resourceType={routerState.resource} />
          <PropertySection
          title="Freeform Fields"
          subtitle="displayed in a feature's info panels"
          fieldId="properties"
          fieldDiscriminator="specifier"
          fields={FIELDS.config as FormFieldArray}
          facet={routerState.facet}
          {entity}
          resourceType={routerState.resource} />
      {:else if routerState.facet === 'images'}
        <ImageSection
          title="Image"
          fields={FIELDS.images as FormField}
          facet={routerState.facet}
          {entity}
          resourceType={routerState.resource} />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={$form} /> -->
  </main>
</div>
