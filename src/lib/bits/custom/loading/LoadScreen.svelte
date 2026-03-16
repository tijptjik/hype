<script lang="ts">
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

<div class="bits-theme">
  <div class={classes}>
    <div class="bits-load-screen__center">
      <div class="bits-load-screen__spinner loading loading-ring loading-lg"></div>
    </div>
  </div>
</div>
