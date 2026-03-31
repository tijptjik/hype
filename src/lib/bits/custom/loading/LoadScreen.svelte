<script lang="ts">
import { fade } from 'svelte/transition'
import type { LoadScreenProps } from './loading.types'

let { color = 'primary', surface = 'transparent' }: LoadScreenProps = $props()
const classes = $derived(
  [
    'bits-load-screen',
    `bits-load-screen--color-${color}`,
    `bits-load-screen--surface-${surface}`,
  ].join(' '),
)
</script>

<div class={classes} in:fade={{ duration: 220 }} out:fade={{ duration: 260 }}>
  <div class="bits-load-screen__center">
    <div class="bits-load-screen__spinner" aria-label="Loading" role="status">
      <span class="bits-load-screen__ring bits-load-screen__ring--outer"></span>
      <span class="bits-load-screen__ring bits-load-screen__ring--middle"></span>
      <span class="bits-load-screen__ring bits-load-screen__ring--inner"></span>
    </div>
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

.bits-load-screen__center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.bits-load-screen__spinner {
  position: relative;
  display: block;
  height: 5.5rem;
  width: 5.5rem;
  color: var(--bits-load-screen-color, var(--color-primary));
}

.bits-load-screen--color-primary {
  --bits-load-screen-color: var(--color-primary);
}

.bits-load-screen--color-accent {
  --bits-load-screen-color: var(--color-accent);
}

.bits-load-screen__ring {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  border: 2px solid color-mix(in srgb, var(--bits-load-screen-color) 44%, transparent);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04);
  animation: bits-load-screen-pulse 1.6s ease-in-out infinite;
}

.bits-load-screen__ring--outer {
  animation-delay: 0s;
  opacity: 0.85;
}

.bits-load-screen__ring--middle {
  inset: 0.75rem;
  animation-delay: 0.18s;
  opacity: 0.72;
}

.bits-load-screen__ring--inner {
  inset: 1.5rem;
  animation-delay: 0.36s;
  opacity: 0.58;
}

@keyframes bits-load-screen-pulse {
  0%,
  100% {
    opacity: 0.38;
    transform: scale(0.94);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
