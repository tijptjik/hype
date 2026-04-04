<script lang="ts">
interface Props {
  text: string
  count?: number | null
}

let { text, count = null }: Props = $props()
</script>

<h3 class="flex items-center gap-2 text-lg font-bold uppercase text-base-100">
  {#if count !== null && count > 0}
    <span
      class="inline-flex min-w-8 items-center justify-center rounded-full bg-white px-2 py-0.5 text-sm font-semibold text-black"
    >
      {count}
    </span>
  {/if}

  <span>{text}</span>
</h3>
