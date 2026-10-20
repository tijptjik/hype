<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// COMPONENTS
import BreadlineToastLoader from './BreadlineToastLoader.svelte'
import HypeLogoLoader from './HypeLogoLoader.svelte'
// TYPES
import type { LoadScreenProps } from './loading.types'

let {
  color = 'primary',
  surface = 'transparent',
  label,
  hubCode,
}: LoadScreenProps = $props()
const isBreadline = $derived(hubCode === 'breadline')
const classes = $derived(
  [
    'bits-load-screen',
    `bits-load-screen--color-${color}`,
    `bits-load-screen--surface-${surface}`,
  ].join(' '),
)
</script>

<div
  class={classes}
  data-hub={hubCode}
  in:fade={{ duration: 220 }}
  out:fade={{ duration: 260 }}
>
  <div class="bits-load-screen__center">
    {#if label}
      <p
        role="status"
        class="whitespace-nowrap text-xs font-medium tracking-[0.18em] text-base-content/70 motion-safe:animate-pulse motion-safe:[animation-duration:3s]"
      >
        {label}
      </p>
    {:else if isBreadline}
      <BreadlineToastLoader />
    {:else}
      <HypeLogoLoader />
    {/if}
  </div>
</div>

<style>
.bits-load-screen {
  position: fixed;
  inset: 0;
  z-index: 140;
  transition: opacity 300ms;
}

.bits-load-screen--surface-transparent {
  background: transparent;
}

.bits-load-screen--surface-base {
  background: var(--color-base-300);
}

.bits-load-screen[data-hub="breadline"] {
  background: var(--color-surface);
}

.bits-load-screen__center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.bits-load-screen--color-primary {
  --bits-load-screen-color: var(--color-primary);
}

.bits-load-screen--color-accent {
  --bits-load-screen-color: var(--color-accent);
}
</style>
