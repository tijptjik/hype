<script lang="ts">
import Form from 'sveltekit-superforms';
// Context
import { getForm } from '$lib/context/forms.svelte';
// Components
import FormSectionHeader from '$lib/components/forms/FormSectionHeader.svelte';
import FormTranslationBar from './FormTranslationBar.svelte';
// Types
import type { Component } from 'svelte';
import SuperDebug from 'sveltekit-superforms';

const sourceLanguageTag = 'en';
const languageTags = [sourceLanguageTag, 'zh-hant', 'zh-hans'];

let {
  title,
  fields,
}: {
  title: string;
  form: Form;
  fields: Record<
    string,
    {
      label: string;
      type: string;
      component: Component;
    }
  >;
} = $props();

const {form, errors, constraints} = getForm();

</script>

<div class="w-full overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <FormSectionHeader {title}/>
  <div class="flex flex-row gap-4 p-4 items-baseline">
    {#each languageTags as languageTag}
      <div class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100">
        <div class="flex flex-col items-start content-start gap-4 px-6 py-2 pt-4 pb-2">
          {#each Object.entries(fields) as [fieldId, field]}
            <!-- svelte-ignore svelte_component_deprecated -->
            <svelte:component
              this={field.component}
              {languageTag}
              {fieldId}
              {field}
              {form}
              {constraints}
              {errors} />
          {/each}
        </div>
        <div class="w-full h-2 group-hover:h-0 group-focus-within:h-0 transition-[height] delay-700 duration-300">
        </div>
        <div class="overflow-hidden transition-[max-height] delay-700 duration-300 ease-in-quad max-h-0 group-hover:max-h-32 group-focus-within:max-h-32">
          <FormTranslationBar {languageTag} {fields} />
        </div>
      </div>
    {/each}
  </div>
</div>
    <!-- <SuperDebug data={$form} /> -->

