<script lang="ts">
// BITS COMPONENTS
import { Switch } from '$lib/bits/custom'
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

let biState = $state(true)
let triState = $state<boolean | null>(null)
let labelTop = $state(true)
let labelBottom = $state(false)
let labelLeft = $state(true)
let labelRight = $state(false)
let labelLeftRight = $state(true)
let labelAll = $state(null)
let labelHoverOnly = $state(false)
let triHoverState = $state<boolean | null>(null)
</script>

<main class="h-full overflow-y-auto p-6">
  <section class="bits-theme space-y-10 rounded-xl border border-base-300 bg-base-100 p-6">
    <h1 class="text-xl font-semibold text-foreground">Switch Variations</h1>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Interactive
      </h2>
      <div class="flex flex-wrap items-center gap-8">
        <label class="flex items-center gap-3">
          <Switch bind:checked={biState} name="enabled-switch" id="enabled-switch" />
          <span class="text-sm text-foreground">Bi-state ({biState ? 'on' : 'off'})</span>
        </label>

        <label class="flex items-center gap-3">
          <Switch
            bind:checked={triState}
            states={3}
            name="tri-switch"
            id="tri-switch"
            rightColor="secondary"
            leftColor="primary" />
          <span class="text-sm text-foreground">
            Tri-state ({triState === null ? 'unset' : triState ? 'on' : 'off'})
          </span>
        </label>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Sizes
      </h2>
      <div class="flex flex-wrap items-center gap-6">
        {#each sizes as size}
          <div class="flex flex-col items-center gap-2">
            <Switch
              checked={true}
              {size}
              color="primary"
              id={`size-${size}`}
              name={`size-${size}`} />
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
          <Switch
            checked={true}
            {size}
            color="primary"
            rightText={`Size ${size.toUpperCase()}`}
            id={`size-label-${size}`}
            name={`size-label-${size}`} />
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
            <Switch checked={true} {color} id={`color-${color}`} name={`color-${color}`} />
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
        <div class="flex items-center gap-3 opacity-70">
          <Switch checked={true} disabled={true} id="disabled-on-switch" />
          <span class="text-sm text-foreground">On</span>
        </div>

        <div class="flex items-center gap-3 opacity-70">
          <Switch checked={false} disabled={true} id="disabled-off-switch" />
          <span class="text-sm text-foreground">Off</span>
        </div>

        <div class="flex items-center gap-3 opacity-70">
          <Switch checked={null} states={3} disabled={true} id="disabled-indeterminate-switch" />
          <span class="text-sm text-foreground">Indeterminate</span>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Labels
      </h2>
      <div class="flex flex-wrap items-center gap-8">
        <Switch bind:checked={labelTop} topText="Top label" />
        <Switch bind:checked={labelBottom} bottomText="Bottom label" />
        <Switch bind:checked={labelLeft} leftText="Left label" />
        <Switch bind:checked={labelRight} rightText="Right label" />
        <Switch
          bind:checked={labelLeftRight}
          leftText="Disabled"
          rightText="Enabled"
          color="success" />
        <Switch
          bind:checked={labelAll}
          states={3}
          leftText="No"
          rightText="Yes"
          topText="Availability"
          leftColor="warning"
          rightColor="success" />
        <Switch
          bind:checked={triHoverState}
          states={3}
          leftText="Accepted"
          rightText="Rejected"
          topText="Tri-state hover labels"
          showLabelsOnHoverOnly={true}
          leftColor="success"
          rightColor="error" />
      </div>
    </div>
  </section>
</main>
