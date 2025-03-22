<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Language, CheckCircle } from '@steeze-ui/heroicons';
// LIB
import { sourceLanguageTag } from '$lib';
import { translateText } from '$lib/i18n';
// TYPES
import type { LanguageTag, Resource } from '$lib/types';
import type { SuperForm } from 'sveltekit-superforms';
import type { AnyZodObject } from 'zod';
import type { Writable } from 'svelte/store';

interface Props {
  form: Writable<SuperForm<Resource, AnyZodObject>>;
  languageTag: LanguageTag;
  fieldRoot: string;
  onConfirm: (event: Event) => void;
  onTranslate: (event: Event) => void;
}

// PROPS
let { form, languageTag, fieldRoot, onConfirm, onTranslate }: Props = $props();

// STATE
let loadingTranslation = $state(false);

// FUNCTIONS
async function handleTranslate(event: Event) {
  event.preventDefault();
  try {
    loadingTranslation = true;
    const translations = await translateText(sourceLanguageTag, languageTag, [
      $form[fieldRoot]
    ]);

    form.update(($form) => {
      if (!$form.translations[languageTag]) {
        $form.translations[languageTag] = {};
      }
      $form.translations[languageTag][fieldRoot] = translations[0];
      $form.translations[languageTag][`${fieldRoot}Gen`] = true;
      return $form;
    });

    onTranslate(event);
  } catch (error) {
    console.error('Translation failed:', error);
  } finally {
    loadingTranslation = false;
  }
}
</script>

<div
  class="bottom-0 left-0 right-0 flex items-center justify-between rounded-b-xl bg-base-200 px-6 py-3">
  <div class="flex items-center gap-4">
    <Icon src={Language} class="h-6 w-6 text-primary" />
    <span class="text-sm text-base-content">OUT OF SYNC</span>
  </div>
  <div class="flex gap-2">
    <button
      class="btn btn-circle"
      disabled={loadingTranslation}
      onclick={(e) => onConfirm(e)}>
      <Icon src={CheckCircle} class="h-6 w-6" />
    </button>
    <button
      class="btn btn-circle btn-primary"
      disabled={loadingTranslation}
      onclick={(e) => handleTranslate(e)}>
      {#if loadingTranslation}
        <span class="loading loading-spinner loading-sm"></span>
      {:else}
        EN
      {/if}
    </button>
  </div>
</div>
