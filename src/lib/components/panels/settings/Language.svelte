<script lang="ts">
import { goto } from '$app/navigation';
// I18N
import { m, setLocale, getLocale } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Language } from '@steeze-ui/heroicons';
import Section from '$lib/components/panels/common/Section.svelte';
// STORES
import { page } from '$app/stores';
// TYPES
import type { LanguageTag } from '$lib/types';

const languages = [
  { name: 'English', code: 'en', 'zh-hant': '英語', 'zh-hans': '英语' },
  { name: '正體字', en: 'Traditional Chinese', code: 'zh-hant', 'zh-hans': '繁體字' },
  { name: '简体字', en: 'Simplified Chinese', code: 'zh-hans', 'zh-hant': '繁體字' }
];

const { session } = $page.data;

const updateLanguage = async (language: string) => {
  await fetch(`/api/users/${session?.user?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ language })
  });

  // Update the language immediately after the API call
  session!.user.language = language as LanguageTag;
  setLocale(language as LanguageTag);
};
</script>

<Section title={m.settings__language()} icon="/language.svg">
  <div class="flex flex-col gap-2 bg-base-200">
    {#each languages as language}
      <div class="flex h-11 w-full flex-row items-center justify-between gap-4 px-4">
        <div class="flex flex-row items-center gap-4">
          <Icon src={Language} class="h-5 w-5" />
          <p class="font-normal text-base-content">{language.name}</p>
          {#if language.code !== getLocale()}
            <p class="text-sm text-neutral-content">
              {language[getLocale()]}
            </p>
          {/if}
        </div>
        <input
          type="radio"
          name="language"
          value={language.code}
          class="radio-primary radio mr-4 h-5 w-5 cursor-pointer"
          checked={getLocale() === language.code}
          onclick={() => updateLanguage(language.code)} />
      </div>
    {/each}
  </div>
</Section>
