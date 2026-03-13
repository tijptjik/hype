<script lang="ts">
import TextAction from './src/TextAction.svelte'
import type { TextDescriptionProps } from './text.types'

let { text, onClick }: TextDescriptionProps = $props()
</script>

<TextAction
  {text}
  {onClick}
  separator="•"
  padding={24}
  class={`${onClick ? 'cursor-pointer ' : ''}text-sm text-base-content/60 hover:text-primary`.trim()}
/>
