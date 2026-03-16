<script lang="ts">
type ScrollableTextProps = {
  text: string
  separator?: string
  padding?: number
  class?: string
  containerClass?: string
  textClass?: string
}

let {
  text,
  separator = '•',
  padding = 24,
  class: className = '',
  containerClass = '',
  textClass = '',
}: ScrollableTextProps = $props()

const content = $derived(text || separator)
</script>

<span
  class={`bits-scrollable-text ${className} ${containerClass}`.trim()}
  style={`--bits-scrollable-text-padding: ${padding}px;`}
  title={text}
>
  <span class={`bits-scrollable-text__content ${textClass}`.trim()}>{content}</span>
</span>
