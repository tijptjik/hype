<script lang="ts">
import ScrollableText from '$lib/components/common/ScrollableText.svelte';

let { text, onClick }: { text: string; onClick?: () => void } = $props();

function handleClick(e: Event) {
  if (!onClick) return;
  e.preventDefault();
  e.stopPropagation();
  onClick();
}
function handleKeyDown(e: KeyboardEvent) {
  if (!onClick) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  }
}
</script>

<div
  class="cursor-pointer text-sm text-base-content/60 hover:text-primary"
  tabindex="-1"
  role={onClick ? 'button' : undefined}
  onclick={onClick ? handleClick : undefined}
  onkeydown={onClick ? handleKeyDown : undefined}>
  <ScrollableText {text} separator="⚲" padding={24} />
</div>
