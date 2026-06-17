<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { HeadingLevel, HeadingProps } from './heading.types'

const LEVEL_CLASS_BY_TAG: Record<HeadingLevel, string> = {
  1: 'text-2xl tracking-tight text-base-content sm:text-xl',
  2: 'text-xl tracking-tight text-base-content sm:text-lg',
  3: 'text-lg tracking-tight text-base-content sm:text-md',
  4: 'text-md text-base-content sm:text-sm',
  5: 'text-sm text-base-content sm:text-xs',
  6: 'text-base uppercase tracking-[0.12em] text-base-content/80',
}

let { children, level = 1, class: className = '' }: HeadingProps = $props()

const tag = $derived(level > 3 ? `h${level - 1}` : ('p' as const))
const effectiveClass = $derived(cx(LEVEL_CLASS_BY_TAG[level], className))
</script>

<svelte:element this={tag} class={effectiveClass}>
  {@render children?.()}
</svelte:element>
