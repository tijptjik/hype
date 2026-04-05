<script lang="ts">
// CORE
import Button from '$lib/bits/core/button/Button.svelte'
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { Snippet } from 'svelte'

type FeatureCardActionVariant = 'default' | 'ghost' | 'secondary' | 'primary'

interface Props {
  text: string
  title?: string
  icon?: Snippet
  onClick?: (event: MouseEvent) => void
  disabled?: boolean
  variant?: FeatureCardActionVariant
  labelClasses?: string
  expandFromClasses?: string
  class?: string
}

let {
  text,
  title,
  icon,
  onClick,
  disabled = false,
  variant = 'default',
  labelClasses = '',
  expandFromClasses = '',
  class: className = '',
}: Props = $props()

function getVariantClasses(resolvedVariant: FeatureCardActionVariant): string {
  if (resolvedVariant === 'ghost') {
    return cx(
      '[--btn-bg:transparent]',
      '[--btn-fg:rgb(255_255_255_/_0.82)]',
      '[--btn-border:rgb(255_255_255_/_0.18)]',
      '[--btn-hover-bg:rgb(255_255_255_/_0.06)]',
      '[--btn-hover-border:rgb(255_255_255_/_0.28)]',
      '[--btn-hover-fg:rgb(255_255_255)]',
      '[--btn-active-bg:rgb(255_255_255_/_0.08)]',
      '[--btn-active-border:rgb(255_255_255_/_0.22)]',
    )
  }

  if (resolvedVariant === 'secondary') {
    return cx(
      '[--btn-bg:transparent]',
      '[--btn-fg:rgb(255_255_255_/_0.88)]',
      '[--btn-border:rgb(255_255_255_/_0.18)]',
      '[--btn-hover-bg:rgb(255_255_255_/_0.06)]',
      '[--btn-hover-border:rgb(255_255_255_/_0.3)]',
      '[--btn-hover-fg:rgb(255_255_255)]',
      '[--btn-active-bg:rgb(255_255_255_/_0.08)]',
      '[--btn-active-border:rgb(255_255_255_/_0.24)]',
    )
  }

  if (resolvedVariant === 'primary') {
    return cx(
      '[--btn-bg:rgb(47_120_255_/_0.12)]',
      '[--btn-fg:rgb(224_238_255)]',
      '[--btn-border:rgb(47_120_255_/_0.92)]',
      '[--btn-hover-bg:rgb(47_120_255_/_0.18)]',
      '[--btn-hover-border:rgb(90_157_255_/_0.98)]',
      '[--btn-hover-fg:rgb(255_255_255)]',
      '[--btn-active-bg:rgb(47_120_255_/_0.24)]',
      '[--btn-active-border:rgb(47_120_255_/_0.94)]',
    )
  }

  return cx(
    '[--btn-bg:rgb(0_0_0_/_0.55)]',
    '[--btn-fg:rgb(255_255_255_/_0.92)]',
    '[--btn-border:rgb(255_255_255_/_0.12)]',
    '[--btn-hover-bg:rgb(255_255_255_/_0.08)]',
    '[--btn-hover-border:rgb(255_255_255_/_0.24)]',
    '[--btn-hover-fg:rgb(255_255_255)]',
    '[--btn-active-bg:rgb(255_255_255_/_0.12)]',
    '[--btn-active-border:rgb(255_255_255_/_0.18)]',
  )
}

const rootClasses = $derived(
  cx(
    'w-11 min-w-11 shrink-0 rounded-full px-0 uppercase font-medium tracking-[0.16em] shadow-none backdrop-blur-[10px]',
    '[--btn-size:2.75rem] [--btn-padding-x:1.3125rem] [--btn-base-label-size:0.8125rem] [--btn-label-multiplier:0]',
    'disabled:opacity-40',
    getVariantClasses(variant),
    expandFromClasses,
    className,
  ),
)

const resolvedLabelClasses = $derived(cx('leading-none text-inherit', labelClasses))
</script>

<Button
  {text}
  {icon}
  color="neutral"
  style="transparent"
  size="md"
  class={rootClasses}
  labelClasses={resolvedLabelClasses}
  attrs={{ title: title ?? text }}
  {disabled}
  {onClick}
/>
