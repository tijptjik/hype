<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte'
import { Trash } from '@steeze-ui/heroicons'

let { onclick } = $props()
</script>

<div
  class="group absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-glass-300/50 hover:cursor-pointer hover:bg-glass-300/70"
  {onclick}
>
  <Icon
    src={Trash}
    class="m-auto h-16 w-16 shrink-0 stroke-current text-error opacity-100 transition-transform group-hover:scale-105"
  />
</div>
