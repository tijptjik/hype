<script lang="ts">
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import CopyIcon from 'virtual:icons/proicons/copy'
import CheckIcon from 'virtual:icons/proicons/checkmark'

let {
  label,
  value,
  html = false,
}: { label: string; value: string; html?: boolean } = $props()
let status = $state('')
let content = $state<HTMLDivElement>()
let overflows = $state(false)
// Fade only clipped content; copying always uses the complete underlying value.
$effect(() => {
  value
  if (!content) return
  const element = content
  const measure = (): void => {
    overflows = element.scrollHeight > element.clientHeight + 1
  }
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  const frame = requestAnimationFrame(measure)
  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
})
const tokens = $derived(
  html
    ? value.split(/("[^"]*"|<\/?[\w-]+|\b[\w-]+(?==)|>)/g)
    : value.split(/([?&]|[^?&=]+(?==))/g),
)
/** Copies the exact output, independently of its visual highlighting.
 * @returns Completion with accessible success or failure feedback.
 */
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    status = 'Copied'
  } catch {
    status = 'Select and copy the text below.'
  }
}
$effect(() => {
  value
  status = ''
})
</script>

<section
  class="border-border bg-canvas min-w-0 shrink-0 overflow-hidden rounded-xl border"
>
  <header
    class="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-2"
  >
    <h3 class="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
      {label}
    </h3>
    <Button
      text={html ? 'Copy iframe code' : 'Copy URL'}
      iconComponent={status === 'Copied' ? CheckIcon : CopyIcon}
      size="sm"
      hideLabel
      style="ghost"
      disabled={!value}
      onClick={copy}
    />
  </header>
  <div class="relative">
    <!-- biome-ignore lint/a11y/useSemanticElements: Read-only textbox uses token spans for syntax highlighting, which a textarea cannot contain. -->
    <div
      bind:this={content}
      role="textbox"
      aria-label={label}
      aria-readonly="true"
      aria-multiline="true"
      tabindex="0"
      class="focus-visible:outline-primary h-24 overflow-hidden p-4 font-mono text-xs leading-6 break-all whitespace-pre-wrap select-text focus-visible:outline-2"
    >
      <code
        >{#each tokens as token, index}
          <span
            class={html
              ? token.startsWith('"')
                ? 'text-secondary'
                : token.startsWith('<') || token === '>'
                  ? 'text-primary'
                  : /^[\w-]+$/.test(token)
                    ? 'text-tertiary'
                    : ''
              : index % 2
                ? 'text-primary'
                : 'text-secondary'}
            >{token}</span
          >
        {/each}</code
      >
    </div>
    {#if overflows}
      <div
        aria-hidden="true"
        class="from-canvas pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t to-transparent"
      ></div>
    {/if}
  </div>
  {#if status}
    <p class="text-muted-foreground px-4 pb-2 text-xs" role="status">{status}</p>
  {/if}
</section>
