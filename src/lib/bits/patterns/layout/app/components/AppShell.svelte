<script lang="ts">
// QUERY
import { QueryClientProvider } from '@tanstack/svelte-query'
// CUSTOM
import { LoadScreen, Toaster } from '$lib/bits/custom'
// TYPES
import type { AppShellProps } from '../app.types'

let {
  queryClient,
  localeKey,
  pendingColor = 'primary',
  pendingSurface = 'base',
  children,
}: AppShellProps = $props()

const classes = $derived(
  [
    'bits-theme',
    'bits-app-shell',
    localeKey === 'zhHant' ? 'bits-app-shell--font-hant' : '',
    localeKey === 'zhHans' ? 'bits-app-shell--font-hans' : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<QueryClientProvider client={queryClient}>
  <div class={classes}>
    <Toaster />
    <svelte:boundary>
      {#snippet pending()}
        <LoadScreen color={pendingColor} surface={pendingSurface} />
      {/snippet}
      {@render children()}
    </svelte:boundary>
  </div>
</QueryClientProvider>
