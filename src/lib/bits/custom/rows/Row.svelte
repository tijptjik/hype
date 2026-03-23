<script lang="ts">
import * as RowPrimitive from './src'
import type { RowProps } from './row.types'

let {
  index,
  isSelected = false,
  variant,
  onclick,
  onkeydown,
  class: className = '',
  image,
  imageSrc,
  alt = 'Resource image',
  onImageClick,
  title = '',
  onTitleClick,
  description = '',
  onDescriptionClick,
  children,
}: RowProps = $props()
</script>

<RowPrimitive.RowRoot
  {index}
  {isSelected}
  {variant}
  {onclick}
  {onkeydown}
  class={className}
>
  {#if title}
    <RowPrimitive.RowTitleSection
      {image}
      {imageSrc}
      {alt}
      {onImageClick}
      {title}
      {onTitleClick}
      {description}
      {onDescriptionClick}
    />
  {/if}

  {#if children}
    {@render children()}
  {/if}
</RowPrimitive.RowRoot>
