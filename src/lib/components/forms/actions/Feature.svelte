<script lang="ts">
// COMPONENTS
import Toggle from '$lib/components/forms/fields/Toggle.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { FieldProps, ModalProps, Feature, EntityRouter } from '$lib/types';

// STATE : PROPS
let actionProps: FieldProps & ModalProps = $props();
let { form } = actionProps.form;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

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
  <Toggle
    size="sm"
    checked={$form.isIntangible as boolean}
    onChange={() => onChange('isIntangible')} />
  <div class="text-ellipsis text-sm font-light">Publicly Accessible</div>
  <Toggle
    size="sm"
    checked={$form.isVisitable as boolean}
    onChange={() => onChange('isVisitable')} />
</div>
