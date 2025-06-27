<script lang="ts">
import Labels from '$lib/components/forms/labels/Input.svelte';
// TYPES
import type { InputProps } from '$lib/types';

// STATE
let {
  value = $bindable(),
  isGenAI,
  id,
  locale = 'core',
  placeholder,
  isTranslated = false,
  onchange,
  onToggleGenAI
}: InputProps & {
  onchange: (e: Event) => unknown;
  onToggleGenAI: (e: MouseEvent) => void;
} = $props();

// SET PLACEHOLDER
placeholder = placeholder ? placeholder : 'Type here';

// Handle content updates
function handleInput(e: Event) {
  const target = e.target as HTMLDivElement;
  value = target.innerText;
  onchange?.(e);
}

// Handle keyboard events
function handleKeyDown(e: KeyboardEvent) {
  // Handle enter key
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertLineBreak');
  }

  // Handle ctrl/cmd + enter for form submission
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const form = (e.target as HTMLElement).closest('form');
    form?.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  // Handle escape to blur
  if (e.key === 'Escape') {
    e.preventDefault();
    (e.target as HTMLElement).blur();
  }

  // Handle ctrl/cmd + backspace to delete word
  if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);
    if (range) {
      const text = (e.target as HTMLElement).textContent || '';
      const start = range.startOffset;
      const beforeCursor = text.slice(0, start);
      const afterCursor = text.slice(start);
      const newBeforeCursor = beforeCursor.replace(/\s*\S+\s*$/, '');
      value = newBeforeCursor + afterCursor;

      // Set cursor position
      const newRange = document.createRange();
      newRange.setStart(e.target as Node, newBeforeCursor.length);
      newRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(newRange);
    }
  }
}

// Handle paste to strip formatting
function handlePaste(e: ClipboardEvent) {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain');
  if (text) {
    document.execCommand('insertText', false, text);
  }
}
</script>

<div
  {id}
  data-testid={id}
  contenteditable="true"
  role="textbox"
  aria-multiline="true"
  bind:textContent={value}
  oninput={handleInput}
  onkeydown={handleKeyDown}
  onpaste={handlePaste}
  class="min-h-[6rem] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-lg border-none bg-transparent p-4 py-[9px] caret-white selection:bg-primary selection:text-base-content focus:outline-none"
  data-placeholder={placeholder}
  class:placeholder-shown={!value}>
  {value}
</div>

{#if (isGenAI || locale !== 'core') && isTranslated}
  <div class="absolute bottom-[20px] right-[7px] flex items-center gap-2">
    <Labels {isGenAI} {onToggleGenAI} />
  </div>
{/if}
