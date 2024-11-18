<script lang="ts">
import { Icon } from '@steeze-ui/svelte-icon';
import { Trash } from '@steeze-ui/heroicons';

let { onclick } = $props();
</script>

<div
  class="absolute right-0 top-0 h-full w-full rounded-lg bg-base-200 opacity-50 hover:opacity-70"
  {onclick}
>
  <Icon src={Trash} class="m-auto w-8 shrink-0 stroke-current opacity-100" />
</div>
