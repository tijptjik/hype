<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { ImportWorkspaceProps } from './importLayout.types'

let { children, class: className = '' }: ImportWorkspaceProps = $props()

const rootClass = $derived(
  cx(
    'flex h-[calc(100dvh-8rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-base-content/15 bg-glass-result shadow-xl',
    className,
  ),
)
</script>

<div class={rootClass}>
  {@render children?.()}
</div>
