<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { HeadingLevel, HeadingProps } from './heading.types'

const LEVEL_CLASS_BY_TAG: Record<HeadingLevel, string> = {
  1: 'text-4xl font-black tracking-tight text-base-content sm:text-5xl',
  2: 'text-3xl font-extrabold tracking-tight text-base-content sm:text-4xl',
  3: 'text-2xl font-bold tracking-tight text-base-content sm:text-3xl',
  4: 'text-xl font-bold text-base-content sm:text-2xl',
  5: 'text-lg font-semibold text-base-content sm:text-xl',
  6: 'text-base font-semibold uppercase tracking-[0.12em] text-base-content/80',
}

let { children, level = 1, class: className = '' }: HeadingProps = $props()

const tag = $derived(`h${level}` as const)
const effectiveClass = $derived(cx(LEVEL_CLASS_BY_TAG[level], className))
</script>

<svelte:element this={tag} class={effectiveClass}>
  {@render children?.()}
</svelte:element>
