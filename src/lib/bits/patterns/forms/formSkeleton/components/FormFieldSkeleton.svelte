<script lang="ts">
// BITS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// STYLES
import { fieldLabelStyles } from '#lib/bits/custom/form/fieldTypography.styles.js'
let {
  label,
  multiline = false,
  inline = false,
  readOnly = false,
}: {
  label: string
  multiline?: boolean
  inline?: boolean
  readOnly?: boolean
} = $props()
</script>

{#if readOnly}
  <section class="min-w-0" aria-hidden="true">
    <h3 class={`flex min-h-7 items-center ${fieldLabelStyles}`}>{label}</h3>
    <div class="mt-2 flex min-h-[42px] items-center px-3">
      <Skeleton class="h-3 w-3/5" />
    </div>
  </section>
{:else}
  <div class="bits-form__field" aria-hidden="true">
    <div class={inline ? 'sr-only' : 'bits-form__label'}>
      <span class={`bits-form__label-text ${fieldLabelStyles}`}>{label}</span>
    </div>
    <div class="bits-form__control-wrap">
      {#if inline}
        <div class="flex h-10 items-center gap-4 px-3">
          <Skeleton class="h-3 w-3/5" /><Skeleton class="ml-auto size-4 rounded-full" />
        </div>
      {:else if multiline}
        <div class="flex h-32 flex-col gap-2 px-2 pt-3">
          <Skeleton class="h-3 w-11/12" />
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-3/4" />
        </div>
      {:else}
        <div class="flex h-10 items-center px-2"><Skeleton class="h-3 w-3/5" /></div>
      {/if}
    </div>
  </div>
{/if}
