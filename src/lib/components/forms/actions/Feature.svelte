<script lang="ts">
// COMPONENTS
import Toggle from '$lib/components/forms/fields/Toggle.svelte';
// TYPES
import type { FieldProps, ModalProps } from '$lib/types';

// STATE : PROPS
let actionProps: FieldProps & ModalProps = $props();
let { form } = actionProps.form;

// UTILS
const onChange = (e: Event, key: string) => {
  e.preventDefault();
  form.update(($form) => {
    $form[key] = !$form[key];
    return $form;
  });
};
</script>

<div class="flex flex-row items-center justify-between gap-2 align-baseline">
  <div class="text-sm font-light">Intangible</div>
  <Toggle
    size="sm"
    checked={$form.isIntangible as boolean}
    onChange={(e) => onChange(e, 'isIntangible')} />
  <div class="text-ellipsis text-sm font-light">Publicly Accessible</div>
  <Toggle
    size="sm"
    checked={$form.isVisitable as boolean}
    onChange={(e) => onChange(e, 'isVisitable')} />
</div>
