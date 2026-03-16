<script lang="ts">
import type { Component } from 'svelte'

interface IconProps {
  src: Component
  size?: string
  theme?: string
  type?: string
  title?: string
  class?: string
  style?: string
  [key: string]: any
}

let {
  src: DynamicIcon,
  size = '24px',
  theme = 'outline',
  type,
  title,
  class: className = '',
  style = '',
  ...restProps
}: IconProps = $props()

const fillClass = $derived(
  theme === 'solid' || theme === 'fill' || type === 'solid'
    ? 'fill-current'
    : 'fill-none',
)
const iconClass = $derived(`${className} ${fillClass}`.trim())
const iconStyle = $derived(
  `${style ? `${style};` : ''}width: ${size}; height: ${size};`.trim(),
)
</script>

<DynamicIcon class={iconClass} style={iconStyle} {title} {...restProps} />
