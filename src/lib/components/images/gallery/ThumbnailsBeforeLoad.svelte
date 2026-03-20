<script lang="ts">
import Uploading from './overlays/Uploading.svelte'
import { fade } from 'svelte/transition'

type Props = {
  number: number
}

let { number }: Props = $props()
</script>

{#each Array(number) as _, i}
  <div
    class="relative h-50 w-50 flex-none animate-pulse rounded-lg bg-base-200"
    in:fade={{ duration: 200, delay: i * 500 }}
  >
    <Uploading />
  </div>
{/each}
