<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits'

const BUTTON_COLORS = [
  'neutral',
  'light',
  'dark',
  'primary',
  'secondary',
  'accent',
  'info',
  'success',
  'warning',
  'error',
] as const

const BUTTON_STYLES = ['none', 'outline', 'dash', 'soft', 'ghost', 'link'] as const
const BUTTON_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const BUTTON_MODIFIERS = ['wide', 'block', 'square', 'circle'] as const
const BUTTON_STYLES_WITH_VARIANTS = BUTTON_STYLES.filter(style => style !== 'none')

function onButtonClick(variant: string) {
  console.log(`[bits-button] click: ${variant}`)
}
</script>

<main class="h-full overflow-y-auto p-6">
  {#snippet globeIcon()}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2.5"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 21a9 9 0 1 0 0-18m0 18c-2.5 0-4.5-4-4.5-9S9.5 3 12 3m0 18c2.5 0 4.5-4 4.5-9S14.5 3 12 3m-8.7 6h17.4M3.3 15h17.4"
      />
    </svg>
  {/snippet}

  <section
    class="bits-theme space-y-8 rounded-xl border border-base-300 bg-base-100 p-6"
  >
    <h1 class="text-xl font-semibold text-foreground">Bits Button Variations</h1>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Colors
      </h2>
      <div class="flex flex-wrap gap-3">
        {#each BUTTON_COLORS as color}
          <Button
            text={color}
            {color}
            onClick={() => onButtonClick(`color:${color}`)}
          />
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Styles
      </h2>
      <div class="space-y-3">
        {#each BUTTON_STYLES_WITH_VARIANTS as styleVariant}
          <div class="space-y-2">
            <p
              class="text-xs font-semibold uppercase tracking-wider text-foreground-alt"
            >
              {styleVariant}
            </p>
            <div class="flex flex-wrap gap-3">
              {#each BUTTON_COLORS as color}
                <Button
                  text={color}
                  {color}
                  style={styleVariant}
                  onClick={() =>
                    onButtonClick(`style:${styleVariant}|color:${color}`)}
                />
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Sizes
      </h2>
      <div class="flex flex-wrap items-end gap-3">
        {#each BUTTON_SIZES as size}
          <Button
            class="uppercase font-mono"
            text={size}
            color="primary"
            {size}
            onClick={() => onButtonClick(`size:${size}`)}
          />
        {/each}
      </div>
      <div class="flex flex-wrap items-end gap-3">
        {#each BUTTON_SIZES as size}
          <Button
            text={`circle-${size}`}
            color="accent"
            icon={globeIcon}
            modifier="circle"
            {size}
            onClick={() => onButtonClick(`size:circle:${size}`)}
          />
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Modifiers
      </h2>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        {#each BUTTON_MODIFIERS as modifier}
          {#if modifier === 'square' || modifier === 'circle'}
            <Button
              text={modifier}
              color="secondary"
              icon={globeIcon}
              {modifier}
              onClick={() => onButtonClick(`modifier:${modifier}`)}
            />
          {:else}
            <Button
              text={modifier}
              color="secondary"
              {modifier}
              onClick={() => onButtonClick(`modifier:${modifier}`)}
            />
          {/if}
        {/each}
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Icon, href, and disabled
      </h2>
      <div class="flex flex-wrap gap-3">
        <Button text="With icon" color="accent" icon={globeIcon} />
        <Button
          text="Link button"
          color="info"
          style="link"
          href="/admin/styles/buttons"
        />
        <Button text="Disabled" color="error" disabled={true} />
        <Button
          text="Disabled outline"
          color="warning"
          style="outline"
          disabled={true}
        />
      </div>
    </div>
  </section>
</main>
