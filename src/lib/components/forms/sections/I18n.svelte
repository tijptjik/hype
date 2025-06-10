<script lang="ts">
import { getFieldComponent } from '$lib';
import { supportedLocales } from '$lib/enums';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import TranslationBar from '$lib/components/forms/bars/Translation.svelte';
// TYPES
import type { SectionProps, Form } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps & { 
  headerActions?: any; 
  infoContent?: any; 
} = $props();
let { fields, form, infoContent } = sectionProps;
</script>

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container">
  <Header
    {...sectionProps}
    infoContent={infoContent}
    actionContent={sectionProps.headerActions}>
  </Header>
  <div class="grid grid-cols-1 gap-4 p-4 @xl:grid-cols-2 @5xl:grid-cols-3">
    {#each supportedLocales as locale}
      <div class="relative group flex flex-col overflow-hidden rounded-xl bg-base-200 pb-[78px]">
        <div class="flex flex-grow flex-col gap-4 rounded-xl bg-base-100 pb-3">
          <div class="flex flex-col content-start items-start gap-4 px-6 pb-2 pt-4">
            {#each Object.entries(fields) as [fieldRoot, field]}
              {@const Field = getFieldComponent(field.component)}
              <Field {locale} {fieldRoot} {field} {form} />
            {/each}
          </div>
        </div>
        <TranslationBar {fields} targetLocale={locale} form={form as unknown as Form} />
      </div>
    {/each}
  </div>
</div>
