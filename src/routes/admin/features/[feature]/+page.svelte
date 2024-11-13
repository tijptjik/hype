<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/FormSectionI18n.svelte';
import PropertySection from '$lib/components/forms/FormSectionPropertyFeature.svelte';
import ImageSection from '$lib/components/forms/FormSectionImage.svelte';
import MapSection from '$lib/components/forms/FormSectionMap.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
// TYPES
import type { SuperForm } from 'sveltekit-superforms';
import type {
  FormFieldConfig,
  Feature,
  ResourceType,
  ResourceRouter,
  FormField,
  FormFieldArray
} from '$lib/types';
// DEBUG
import SuperDebug from 'sveltekit-superforms';

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    title: {
      label: 'Title',
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
    }
  },
  address: {
    formattedAddress: {
      label: 'Formatted Address',
      component: 'InputField'
    }
  }
};

// STATE : PROPS
let { data }: { data: { validatedForm: SuperForm<Feature>; entity: string } } = $props();
let { validatedForm, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
const title = $derived(data.validatedForm.data.title || 'New');

// STATE : FORM
let { enhance, form, errors } = setForm(
  routerState.resource as ResourceType,
  entity,
  validatedForm
);
</script>

<!-- LAYOUT -->
<Header entity={data.entity} resourceType={routerState.resource} {title} />
<form method="POST" use:enhance class="h-full flex-1 overflow-hidden">
  <main class="h-full flex flex-1 flex-row gap-6 p-6 pb-0 pr-3 bg-black">
    <div class="@container z-10 h-full relative flex-1 basis-1/3">
      <MapSection {entity} resourceType={routerState.resource} />
      <div class="absolute hidden @md:flex bottom-2 left-0 right-0 items-center justify-center gap-6 p-4">
        <UserAttributionCard
          userId={$form.contributorId}
          date={$form.createdAt}
          type="contributor" />
        {#if $form.publisherId && $form.publishedAt}
          <UserAttributionCard
            userId={$form.publisherId}
            date={$form.publishedAt}
            type="publisher" />
        {/if}
      </div>
    </div>
    <div class="basis-2/3 flex gap-6 overflow-auto pr-3 pb-12 flex-col-reverse justify-end">
      {#if routerState.facet === 'core' || routerState.facet === false}
      <div class="flex flex-row gap-6">
        <PropertySection
          title="Classifiers"
          subtitle="by which features can be filtered"
          fieldDiscriminator="classifier"
          fields={FIELDS.property as FormFieldArray}
          {entity}
          resourceType={routerState.resource} />
        <PropertySection
          title="Specifiers"
          subtitle="which are displayed in feature info panels"
          fieldDiscriminator="specifier"
          fields={FIELDS.property as FormFieldArray}
          {entity}
          resourceType={routerState.resource} />
      </div>
        <I18nSection
          title="Descriptors"
          fields={FIELDS.i18n as FormField}
          facet={routerState.facet}
          {entity}
          resourceType={routerState.resource} />
        <!-- TODO Add support for translatable specifiers -->
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </div>
    <!-- <SuperDebug data={form} /> -->
  </main>
</form>
