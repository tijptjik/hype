<script lang="ts">
// BITS COMPONENTS
import { Checkbox } from '$lib/bits/custom'
import type { ButtonColor, ButtonSize } from '$lib/bits/core/button/button.types'

const sizes: ButtonSize[] = ['xs', 'sm', 'md', 'lg', 'xl']
const colors: ButtonColor[] = [
  'neutral',
  'primary',
  'secondary',
  'accent',
  'info',
  'success',
  'warning',
  'error'
]

let checked = $state(true)
let indeterminate = $state(true)
let labelTop = $state(true)
let labelBottom = $state(false)
let labelLeft = $state(true)
let labelRight = $state(false)
let labelLeftRight = $state(true)
let labelHoverOnly = $state(false)
</script>

<main class="h-full overflow-y-auto p-6">
  <section class="bits-theme space-y-10 rounded-xl border border-base-300 bg-base-100 p-6">
    <h1 class="text-xl font-semibold text-foreground">Checkbox Variations</h1>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Interactive
      </h2>
      <div class="flex flex-wrap items-center gap-8">
        <Checkbox bind:checked leftText="Enabled" />

        <Checkbox bind:indeterminate checked={false} leftText="Indeterminate" color="info" />
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Sizes
      </h2>
      <div class="flex flex-wrap items-center gap-6">
        {#each sizes as size}
          <div class="flex flex-col items-center gap-2">
            <Checkbox checked={true} {size} color="primary" id={`checkbox-size-${size}`} />
            <span class="text-xs uppercase tracking-wide text-foreground-alt">{size}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Sizes With Labels
      </h2>
      <div class="flex flex-wrap items-center gap-6">
        {#each sizes as size}
          <Checkbox
            checked={true}
            {size}
            color="primary"
            rightText={`Size ${size.toUpperCase()}`}
            id={`checkbox-size-label-${size}`} />
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Colors
      </h2>
      <div class="flex flex-wrap items-center gap-5">
        {#each colors as color}
          <div class="flex flex-col items-center gap-2">
            <Checkbox checked={true} {color} id={`checkbox-color-${color}`} />
            <span class="text-xs uppercase tracking-wide text-foreground-alt">{color}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Disabled
      </h2>
      <div class="flex flex-wrap items-center gap-8">
        <Checkbox checked={true} disabled={true} leftText="Checked" />
        <Checkbox checked={false} disabled={true} leftText="Unchecked" />
        <Checkbox checked={false} indeterminate={true} disabled={true} leftText="Indeterminate" />
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Labels
      </h2>
      <div class="flex flex-wrap items-center gap-8">
        <Checkbox bind:checked={labelTop} topText="Top label" />
        <Checkbox bind:checked={labelBottom} bottomText="Bottom label" />
        <Checkbox bind:checked={labelLeft} leftText="Left label" />
        <Checkbox bind:checked={labelRight} rightText="Right label" />
        <Checkbox
          bind:checked={labelLeftRight}
          leftText=">>>>"
          rightText="<<<<"
          color="success" />
        <Checkbox
          bind:checked={labelHoverOnly}
          leftText="MORE"
          rightText="MORE"
          topText="Hover-only side labels"
          showLabelsOnHoverOnly={true} />
      </div>
    </div>
  </section>
</main>
