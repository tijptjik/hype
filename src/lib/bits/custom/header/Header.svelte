<script lang="ts">
// COMPONENTS
import { Header as HeaderPrimitive } from './src'
// TYPES
import type { HeaderProps } from './header.types'

let {
  text,
  description,
  icon: IconComponent,
  size = 'md',
  ref = $bindable(null),
  class: className = '',
  style = '',
  ...restProps
}: HeaderProps = $props()

const rootClass = $derived(
  [
    'bits-header',
    `bits-header--size-${size}`,
    IconComponent ? 'bits-header--with-icon' : '',
    text ? 'bits-header--with-title' : '',
    description ? 'bits-header--with-subtitle' : '',
    text && description ? 'bits-header--with-title-and-subtitle' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')
)
</script>

<HeaderPrimitive.Root bind:ref class={rootClass} {style} {...restProps}>
  {#if IconComponent}
    <HeaderPrimitive.Icon class="bits-header__icon-wrap" icon={IconComponent} aria-hidden="true" />
  {/if}

  {#if text}
    <HeaderPrimitive.Title class="bits-header__title" text={text} />
  {/if}

  {#if description}
    <HeaderPrimitive.Subtitle
      class={[
        'bits-header__subtitle',
        text ? 'bits-header__subtitle--with-title' : 'bits-header__subtitle--solo'
      ]
        .filter(Boolean)
        .join(' ')}
      text={description} />
  {/if}
</HeaderPrimitive.Root>
