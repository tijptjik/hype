<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Toggle from '$lib/components/forms/fields/Toggle.svelte';
// TYPES
import type { FeatureForm } from '$lib/types';

// STATE : PROPS
let { form }: { form: FeatureForm } = $props();

// STATE : CONTEXT :: FORM
let featureForm: FeatureForm['form'] = $derived(form.form);

// UTILS
const onChange = (e: Event, key: 'isIntangible' | 'isVisitable'): void => {
  e.preventDefault();
  featureForm.update(($form) => {
    $form[key] = !$form[key];
    return $form;
  });
};
</script>

<div class="flex flex-row items-center justify-between gap-4 align-baseline">
  <Toggle
    label={m.teary_fit_maggot_heart()}
    size="sm"
    checked={$featureForm.isIntangible as boolean}
    onChange={(e) => onChange(e, 'isIntangible')} />
  <Toggle
    label={m.even_sunny_lizard_dare()}
    size="sm"
    checked={$featureForm.isVisitable as boolean}
    onChange={(e) => onChange(e, 'isVisitable')} />
</div>
