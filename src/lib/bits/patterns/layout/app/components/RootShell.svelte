<script lang="ts">
// QUERY
// BITS
import { LoadScreen, Toaster } from '#lib/bits/custom/index.js'
import { cx } from '#lib/bits/utils.js'
// TYPES
import type { AppShellProps } from '../app.types'

let { localeKey, isReady, children }: AppShellProps = $props()

const classes = $derived(
  cx(
    'bits-theme',
    'flex h-lvh min-h-0 w-lvw min-w-0 flex-row overflow-hidden overscroll-contain bg-panel',
    localeKey === 'zhHant' ? 'font-(--font-hant)' : '',
    localeKey === 'zhHans' ? 'font-(--font-hans)' : '',
  ),
)
</script>

<div class={classes}>
  <Toaster />
  {#if isReady}
    {@render children()}
  {:else}
    <LoadScreen color="accent" />
  {/if}
</div>
