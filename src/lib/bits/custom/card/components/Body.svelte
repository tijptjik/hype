<script lang="ts">
import type { Snippet } from 'svelte'
import ScrollableText from '$lib/bits/custom/text/ScrollableText.svelte'
import type { CardBodyProps } from '../card.types'

type Props = CardBodyProps & {
  tags?: Snippet
}

let {
  code = null,
  title,
  description = null,
  maxDescriptionLines = 2,
  class: className = '',
  tags,
}: Props = $props()

const resolvedTitle = $derived(title?.trim() || '-')
const descriptionStyle = $derived(
  `--bits-card-description-lines: ${Math.max(1, maxDescriptionLines)};`,
)
</script>

<div class={['bits-card__body', className].filter(Boolean).join(' ')}>
  {#if code}
    <span class="bits-card__code" title={code}>{code}</span>
  {/if}

  <ScrollableText
    text={resolvedTitle}
    padding={0}
    class="bits-card__title-wrap"
    textClass="bits-card__title-text"
  />

  {#if description}
    <p class="bits-card__description" style={descriptionStyle} title={description}>
      {description}
    </p>
  {/if}

  {#if tags}
    <div class="bits-card__tags">{@render tags()}</div>
  {/if}
</div>
