<script lang="ts">
import { getForm } from '$lib/context/forms.svelte';
// COMPONENTS
import Toggle from '$lib/components/forms/fields/Toggle.svelte';

// TYPES
import type { FieldProps, ModalProps, Feature } from '$lib/types';

// STATE : PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false),
  resource,
  entity
}: FieldProps & ModalProps = $props();

// STATE : CONTEXT
const { form } = getForm<Feature>(resource, entity);

// UTILS
const onChange = (key: string) => {
  form.update(($form) => {
    $form[key] = !$form[key];
    return $form;
  });
};
</script>

<div class="flex flex-row items-center justify-between gap-2 align-baseline">
  <div class="text-sm font-light">Intangible</div>
  <Toggle size="sm" checked={$form.isIntangible as boolean} onChange={() => onChange('isIntangible')} />
  <div class="text-ellipsis text-sm font-light">Publicly Accessible</div>
  <Toggle size="sm" checked={$form.isVisitable as boolean} onChange={() => onChange('isVisitable')} />
</div>
