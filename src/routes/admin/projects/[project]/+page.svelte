<script lang="ts">
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import SpecificationSection from '$lib/components/forms/sections/Specification.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import PropertySection from '$lib/components/forms/sections/Property.svelte';
import UserSection from '$lib/components/forms/sections/User.svelte';
// CONFIG
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';
// TYPES
import type { SuperValidated } from 'sveltekit-superforms';
import type { Project } from '$lib/types';
import type {
  ResourceRouter,
  FormField,
  FormFieldArray,
  NavProps,
  PageProps,
  Organisation
} from '$lib/types';

import SuperDebug from 'sveltekit-superforms';

// CONFIG
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
            },
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
let { data }: PageProps<Organisation> = $props();
let { validatedForm } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
let title = $derived(data.validatedForm.data.name || 'New');

let navProps: NavProps = $derived({
  resource: routerState.resource,
  entity: data.entity,
  facet: routerState.facet || 'core'
});

// STATE : FORM
let { enhance } = setForm<Organisation>(navProps.resource, navProps.entity, validatedForm);

$effect(() => {
  //Remove parentRef from URL if it exists
  const url = new URL(window.location.href);
  url.searchParams.delete('parentRef');
  // shallow navigation
  goto(url.toString(), { replaceState: true });
  console.log('navProps INNER', navProps);
});
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header {title} {...navProps} />
  <form method="POST" use:enhance>
    <main class="flex flex-col gap-6 p-6">
      {#if navProps.facet === 'core'}
        <I18nSection title="Descriptors" fields={FIELDS.i18n} {...navProps} />
        <I18nSection title="Credit" fields={FIELDS.credit} {...navProps} />
        <div class="flex flex-row gap-6">
          <UserSection
            title="Members with Edit Access"
            subtitle="Maintainers have access to the review queue and can accept or reject feature changes"
            fields={FIELDS.users}
            {...navProps} />
          <SpecificationSection title="Specification" fields={FIELDS.specification} {...navProps} />
        </div>
      {:else if navProps.facet === 'fields'}
        <PropertySection
          title="Categorical Fields"
          subtitle="by which features can be filtered"
          fields={FIELDS.config as FormFieldArray}
          fieldDiscriminator="classifier"
          {...navProps} />
        <PropertySection
          title="Freeform Fields"
          subtitle="displayed in a feature's info panels"
          fields={FIELDS.config as FormFieldArray}
          fieldDiscriminator="specifier"
          {...navProps} />
      {:else if navProps.facet === 'images'}
        <ImageSection title="Image" fields={FIELDS.images} {...navProps} />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </main>
    <!-- <SuperDebug data={$form} /> -->
  </form>
</div>
