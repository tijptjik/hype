<script lang="ts">
import * as IndexCardPrimitive from './components'
import type { IndexCardProps } from './indexCard.types'

let {
  title,
  description,
  imageSrc,
  imageFallbackSrcs,
  imageAlt,
  imageLayout = 'cover',
  cardWidth = 0,
  footerStatus = null,
  breadcrumbs = [],
  onNavigate,
  header,
  content,
  actions,
  footer,
  onImageClick,
}: IndexCardProps = $props()

function handleNavigate(event: MouseEvent | KeyboardEvent): void {
  onNavigate?.(event)
}

function handleCardKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    handleNavigate(event)
    return
  }

  if (event.key !== ' ') return

  event.preventDefault()

  if (onImageClick) {
    onImageClick()
    return
  }

  handleNavigate(event)
}

function handleHeaderImageClick(event: MouseEvent): void {
  if (!onImageClick) {
    return
  }

  event.stopPropagation()
  onImageClick()
}
</script>

<IndexCardPrimitive.Root onclick={handleNavigate} onkeydown={handleCardKeyDown}>
  {#if header}
    {@render header()}
  {:else}
    <IndexCardPrimitive.Header
      {imageSrc}
      {imageFallbackSrcs}
      {imageAlt}
      {imageLayout}
      onImageClick={handleHeaderImageClick}
    />
  {/if}

  {#if content}
    <div class="bits-index-card__body">
      {@render content()}
      {#if actions}
        <div class="mt-[0.35rem] flex w-full items-center justify-between">
          {@render actions()}
        </div>
      {/if}
    </div>
  {:else}
    <IndexCardPrimitive.Body {title} {description} {actions} />
  {/if}

  {#if footer}
    <footer class="bits-index-card__footer">{@render footer()}</footer>
  {:else}
    <IndexCardPrimitive.Footer status={footerStatus} {breadcrumbs} {cardWidth} />
  {/if}
</IndexCardPrimitive.Root>
