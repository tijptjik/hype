<script lang="ts">
// COMPONENTS
import { Header as HeaderPrimitive } from './src'
import HeaderBreadcrumbs from './src/components/HeaderBreadcrumbs.svelte'
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { HeaderProps } from './header.types'

let {
  text,
  description,
  hideTitle = false,
  hideDescription = false,
  icon: IconComponent,
  iconHoverColor,
  href,
  crumbs = [],
  size = 'md',
  ref = $bindable(null),
  id,
  class: className = '',
  style = '',
}: HeaderProps = $props()

const rootClass = $derived(
  [
    'bits-header',
    `bits-header--size-${size}`,
    IconComponent ? 'bits-header--with-icon' : '',
    crumbs.length > 0 ? 'bits-header--with-crumbs' : '',
    text && !hideTitle ? 'bits-header--with-title' : '',
    description && !hideDescription ? 'bits-header--with-subtitle' : '',
    text && !hideTitle && description && !hideDescription
      ? 'bits-header--with-title-and-subtitle'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const resolvedStyle = $derived(style ?? undefined)
const iconClass = $derived(
  cx(
    'bits-header__icon-wrap',
    iconHoverColor &&
      '[--bits-header-icon-hover-color:var(--bits-header-icon-hover-color-value)]',
  ),
)
const iconStyle = $derived(
  iconHoverColor
    ? `--bits-header-icon-hover-color-value: ${iconHoverColor};`
    : undefined,
)
</script>

<HeaderPrimitive.Root bind:ref {id} class={rootClass} style={resolvedStyle}>
  <HeaderBreadcrumbs {crumbs} />

  {#if IconComponent}
    <HeaderPrimitive.Icon
      class={iconClass}
      style={iconStyle}
      icon={IconComponent}
      {href}
      aria-hidden="true"
    />
  {/if}

  {#if !hideTitle}
    <HeaderPrimitive.Title
      class="bits-header__title"
      data-header-title-text=""
      {text}
    />
  {/if}

  {#if description && !hideDescription}
    <HeaderPrimitive.Subtitle
      class={[
        'bits-header__subtitle',
        text ? 'bits-header__subtitle--with-title' : 'bits-header__subtitle--solo'
      ]
        .filter(Boolean)
        .join(' ')}
      data-header-title-description=""
      text={description}
    />
  {/if}
</HeaderPrimitive.Root>
