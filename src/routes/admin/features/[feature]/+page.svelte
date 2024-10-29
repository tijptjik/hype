<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/FormSectionI18n.svelte';
import SpecificationSection from '$lib/components/forms/FormSectionSpecification.svelte';
import ImageSection from '$lib/components/forms/FormSectionImage.svelte';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
// TYPES
import type { FormFieldConfig } from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Feature } from '$lib/types';
import type { ResourceType } from '$lib/types';
import SuperDebug from 'sveltekit-superforms';

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    properties: {
      descriptors: {
        title: {
          label: 'Title',
          component: InputField
        },
        description: {
          label: 'Description',
          component: TextareaField
        }
      }
    }
  },
  classification: {
    properties: {
      classifiers: {
        grade: {
          label: 'Rating',
          // TODO: Make range slider
          component: InputField
        }
      }
    }
  },
  markers: {
    properties: {
      display: {
        markerSize: {
          label: 'Marker Size',
          component: InputField
        },
        markerSymbol: {
          label: 'Marker Symbol',
          component: InputField
        },
        markerColor: {
          label: 'Marker Color',
          component: InputField
        }
      }
    }
  },
  address: {
    formattedAddress: {
      label: 'Formatted Address',
      component: InputField
    }
  }
};

const CUSTOM_FIELDS = {
  i18n : false,
  classification: {
    classifiers: {
      grade: {
        label: 'Rating',
        component: InputField
      }
    }
  }
}

// STATE : PROPS
let { data }: { data: { form: SuperValidated<Feature>; entity: string } } = $props();
let { form, entity } = data;

// STATE : DERIVED
const routerState = getRouterState();

// STATE : FORM
const FormContext = setForm(routerState.resource as ResourceType, entity, form);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header
    entity={data.entity}
    resourceType={routerState.resource as ResourceType}
    title={data.form.data.title || 'New'} />
  <main class="flex w-full flex-col p-6">
    {#if Object.keys(FormContext.message).length > 0}<h3>{get(FormContext.message)}</h3>{/if}
    <form method="POST" use:FormContext.enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <I18nSection
          title="Descriptors"
          fields={FIELDS.i18n}
          {entity}
          resourceType={routerState.resource as ResourceType} />
        <div class="flex flex-row gap-6">
          <SpecificationSection
            title="Properties"
            fields={FIELDS.properties}
            {entity}
            resourceType={routerState.resource as ResourceType} />
          <I18nSection
            title="Address"
            fields={FIELDS.address}
            {entity}
            resourceType={routerState.resource as ResourceType} />
        </div>
      {:else if routerState.facet === 'images'}
        <ImageSection
          title="Image"
          fields={FIELDS.images}
          {entity}
          resourceType={routerState.resource as ResourceType} />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={FormContext.form} /> -->
  </main>
</div>
