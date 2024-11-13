<script lang="ts">
import { getForm } from '$lib/context/forms.svelte';
import Toggle from './FormFieldCheckbox.svelte';

// TYPES
import type { ResourceType, FalsableRef } from '$lib/types';

// TYPES
type Props = {
  feature: FalsableRef;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { feature, entity, resourceType }: Props = $props();

// STATE : CONTEXT
const { form, errors, constraints } = getForm(resourceType, entity);

// UTILS
const onChange = (key: string) => {
  form.update(($form) => {
    $form[key] = !$form[key];
    return $form;
  });
};
</script>

<div class="flex flex-row gap-2 items-center justify-between align-baseline">
  <div class="text-sm font-light">Intangible</div>
  <Toggle size='sm' checked={$form.isIntangible} onChange={() => onChange('isIntangible')} />
  <div class="text-sm font-light text-ellipsis">Publicly Accessible</div>
  <Toggle size='sm' checked={$form.isVisitable} onChange={() => onChange('isVisitable')} />
</div>