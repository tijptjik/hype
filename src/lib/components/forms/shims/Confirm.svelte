<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { ExclamationTriangle } from '@steeze-ui/heroicons';

// STATE : PROPS
let { onCancel, onAccept } = $props();
</script>

<div
  class="absolute right-0 top-0 z-10 flex h-full w-full flex-col items-center justify-center gap-4 rounded-lg bg-base-200 bg-opacity-80">
  <Icon
    src={ExclamationTriangle}
    class="shrink-10 h-12 w-12 stroke-current opacity-100" />
  <p class="w-1/3 text-center text-xl font-bold text-error">
    This is a destructive action.
  </p>
  <p class="w-1/3 text-center text-xl text-neutral-content">
    Deleting this field eliminates the associated filter control and entries in the info
    panel.
  </p>
  <p class="w-1/3 text-center text-xl text-neutral-content">
    This action is irreversible.
  </p>
  <div class="flex gap-4">
    <button class="btn btn-outline" onclick={onCancel}>Cancel</button>
    <button class="btn btn-error" onclick={onAccept}>DESTROY</button>
  </div>
</div>
