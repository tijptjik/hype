<script lang="ts">
import ScrollableText from '../ScrollableText.svelte'
import type { TextActionProps } from '../text.types'

let {
  text,
  onClick,
  separator,
  padding,
  tabIndex,
  class: className = '',
}: TextActionProps = $props()

function handleClick(event: Event): void {
  if (!onClick) return
  event.preventDefault()
  event.stopPropagation()
  onClick()
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!onClick || event.key !== 'Enter') return
  event.preventDefault()
  event.stopPropagation()
  onClick()
}
</script>

{#if onClick}
  <button
    type="button"
    tabindex={tabIndex}
    class={className}
    onclick={handleClick}
    onkeydown={handleKeyDown}
  >
    <ScrollableText {text} {separator} {padding} />
  </button>
{:else}
  <div class={className}><ScrollableText {text} {separator} {padding} /></div>
{/if}
