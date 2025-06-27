<script lang="ts">
import { getFieldComponent } from '$lib';
import { supportedLocales } from '$lib/enums';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import TranslationBar from '$lib/components/forms/bars/Translation.svelte';
// TYPES
import type { SectionProps, Form, ProjectForm } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps & {
  headerActions?: any;
  infoContent?: any;
} = $props();
let { fields, form, infoContent } = sectionProps;
</script>

<div class="z-10 flex flex-col gap-0 rounded-2xl bg-transparent p-0 @container">
  <Header {...sectionProps} {infoContent} actionContent={sectionProps.headerActions}>
  </Header>
  <div
    class="grid grid-cols-1 gap-4 overflow-visible py-2 @xl:grid-cols-2 @5xl:grid-cols-3">
    {#each supportedLocales as locale}
      <div
        class="bg-grain group relative flex flex-col overflow-visible rounded-xl border-[4px] border-primary bg-glass-300 pb-[78px]">
        <div class="flex flex-grow flex-col gap-4 rounded-xl pb-3">
          <div class="flex flex-col content-start items-start gap-4 px-6 pb-2 pt-5">
            <div
              class="absolute right-6 -mt-2 flex flex-col gap-4 text-2xl font-bold uppercase text-white/20">
              {locale.replace('zh-hant', 'HK').replace('zh-hans', 'CN').toUpperCase()}
            </div>
            {#each Object.entries(fields) as [fieldRoot, field]}
              {@const Field = getFieldComponent(field.component)}
              <Field
                {locale}
                fieldRoot={fieldRoot as 'properties'}
                {field}
                form={form as Form & ProjectForm}
                fieldIndex={0}
                fieldKey="value"
                fieldDiscriminator="display" />
            {/each}
          </div>
        </div>
        <TranslationBar {fields} targetLocale={locale} form={form as unknown as Form} />
      </div>
    {/each}
  </div>
</div>
