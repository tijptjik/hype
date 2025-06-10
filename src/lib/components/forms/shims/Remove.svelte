<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { Trash } from '@steeze-ui/heroicons';

let { onclick } = $props();
</script>

<div
  class="group absolute right-0 top-0 z-10 flex h-full w-full flex-col items-center justify-center rounded-lg bg-base-200/50 hover:bg-base-200/70"
  {onclick}>
  <Icon
    src={Trash}
    class="m-auto h-16 w-16 shrink-0 stroke-current text-error opacity-100 transition-transform group-hover:scale-105" />
</div>
