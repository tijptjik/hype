<script lang="ts">
// Context
import { getForm } from '$lib/context/forms.svelte';
// Components
import Header from '$lib/components/forms/FormHeader.svelte';
import TranslationBar from './FormTranslationBar.svelte';
// Types
import SuperDebug from 'sveltekit-superforms';
import type { FormField, ResourceType, FalsableRef } from '$lib/types';

// CONFIG
const sourceLanguageTag = 'en';
const languageTags = [sourceLanguageTag, 'zh-hant', 'zh-hans'];

// TYPES
type Props = {
  title: string;
  fields: FormField;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { title, fields, entity, resourceType }: Props = $props();

// STATE : CONTEXT
const { form, errors, constraints } = getForm(resourceType, entity);
</script>

<div class="w-full overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header {title} {entity} {resourceType} />
  <div class="flex flex-row items-baseline gap-4 p-4">
    {#each languageTags as languageTag}
      <div class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100">
        <div class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-2 pt-4">
          {#each Object.entries(fields) as [fieldId, field]}
            <field.component {languageTag} {fieldId} {field} {form} {constraints} {errors} {entity} {resourceType} />
          {/each}
        </div>
        <div
          class="h-2 w-full transition-[height] delay-700 duration-300 group-focus-within:h-0 group-hover:h-0">
        </div>
        <div
          class="ease-in-quad max-h-0 overflow-hidden transition-[max-height] delay-700 duration-300 group-focus-within:max-h-32 group-hover:max-h-32">
          <TranslationBar {languageTag} {fields} {entity} {resourceType} />
        </div>
      </div>
    {/each}
  </div>
</div>
<!-- <SuperDebug data={$form} /> -->
