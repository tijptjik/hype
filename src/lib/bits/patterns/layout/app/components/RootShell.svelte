<script lang="ts">
// QUERY
import { QueryClientProvider } from '@tanstack/svelte-query'
// BITS
import { LoadScreen, Toaster } from '$lib/bits/custom'
import { cx } from '$lib/bits/utils'
// TYPES
import type { AppShellProps } from '../app.types'

let { queryClient, localeKey, isReady, children }: AppShellProps = $props()

const classes = $derived(
  cx(
    'bits-theme',
    'flex h-lvh min-h-0 w-lvw min-w-0 flex-row overflow-hidden overscroll-contain bg-black',
    localeKey === 'zhHant' ? 'font-(--font-hant)' : '',
    localeKey === 'zhHans' ? 'font-(--font-hans)' : '',
  ),
)
</script>

<QueryClientProvider client={queryClient}>
  <div class={classes}>
    <Toaster />
    {#if isReady}
      {@render children()}
    {:else}
      <LoadScreen color="accent" />
    {/if}
  </div>
</QueryClientProvider>
