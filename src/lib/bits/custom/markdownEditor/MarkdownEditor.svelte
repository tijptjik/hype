<script lang="ts">
// SVELTE
import { tick, type Snippet } from 'svelte'
// THIRD-PARTY
import DOMPurify from 'dompurify'
// CONTENT
import { isLegacyHtml } from '#lib/services/markdown.js'
// STYLES
import { markdownEditorStyles } from './markdownEditor.styles.js'
// BITS COMPONENTS
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
// TYPES
import type { Crepe } from '@milkdown/crepe'

let {
  value,
  attrs,
  label,
  onDone,
  onCancel,
  toolbarActions,
}: {
  toolbarActions?: Snippet
  value: string
  attrs: Record<string, unknown>
  label: string
  onDone: () => void
  onCancel: (event: KeyboardEvent) => void
} = $props()
let source = $state(false)
let host = $state<HTMLDivElement>()
let control: HTMLTextAreaElement
let root: HTMLDivElement
let toolbarSlot: HTMLDivElement
let sourceMinimum = 192
let sourceHeight = $state(192)
let editor = $state<Crepe | undefined>()
let error = $state('')
let ready = $state(false)
let current = ''
let replacing = false
let replace: ((text: string) => void) | undefined

/** Give Crepe's icon-only toolbar names and keyboard activation.
 * @param event Keyboard event from the editor surface. @returns Nothing.
 */
function editorKeydown(event: KeyboardEvent): void {
  const button =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('.milkdown-top-bar button')
      : null
  if (button && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    event.stopPropagation()
    button.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    )
    return
  }
  onCancel(event)
}

/** Label the fixed toolbar configuration used by this version of Crepe.
 * @param target Editor mount. @returns Nothing.
 */
function labelToolbar(target: HTMLElement): void {
  const labels = [
    'Bold',
    'Italic',
    'Strikethrough',
    'Code',
    'Bullet list',
    'Numbered list',
    'Task list',
    'Link',
    'Table',
    'Code block',
    'Quote',
    'Divider',
  ]
  target
    .querySelectorAll<HTMLButtonElement>('.top-bar-item')
    .forEach((button, index) => {
      const label = labels[index]
      if (!label) return
      button.setAttribute('aria-label', label)
      button.title = label
    })
  target
    .querySelector('.top-bar-heading-button')
    ?.setAttribute('aria-label', 'Text style')
}

/** Forward visual edits through the registered native remote-form control.
 * @param text Serialized Markdown. @returns Nothing.
 */
function publish(text: string): void {
  current = text
  control.value = text
  control.dispatchEvent(new Event('input', { bubbles: true }))
}

$effect(() => {
  const target = host
  if (!target || source) return
  let disposed = false
  let instance: Crepe | undefined
  // Keep Crepe's owned toolbar node in our shared sticky header; its view still disposes it.
  const observer = new MutationObserver(() => {
    const toolbar = target.querySelector('.milkdown-top-bar')
    if (toolbar) toolbarSlot.append(toolbar)
    labelToolbar(root)
  })
  observer.observe(root, { childList: true, subtree: true })
  ready = false
  error = ''
  void (async () => {
    const [
      { Crepe },
      { $prose: prosePlugin, replaceAll },
      { Plugin },
      { serializerCtx },
    ] = await Promise.all([
      import('@milkdown/crepe'),
      import('@milkdown/kit/utils'),
      import('@milkdown/kit/prose/state'),
      import('@milkdown/kit/core'),
      import('@milkdown/crepe/theme/common/style.css'),
      import('@milkdown/crepe/theme/frame.css'),
    ])
    if (disposed) return
    current = control.value
    // Existing HTML descriptions become Markdown only after an actual document edit.
    const html = document.createElement('div')
    html.innerHTML = isLegacyHtml(current) ? DOMPurify.sanitize(current) : ''
    const initial = isLegacyHtml(current)
      ? { type: 'html' as const, dom: html }
      : current
          .replace(/<br\s*\/?>(?:\r?\n)?/gi, '  \n')
          .replace(
            /\[([^\s<>[\]]+@[^\s<>[\]]+\.[^\s<>[\]]+)\](?!\()/g,
            '[$1](mailto:$1)',
          )
    instance = new Crepe({
      root: target,
      defaultValue: initial,
      features: {
        [Crepe.Feature.TopBar]: true,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Cursor]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.CodeMirror]: false,
        [Crepe.Feature.AI]: false,
      },
    })
    // Publish each document transaction synchronously, including an immediate Save click.
    instance.editor.use(
      prosePlugin(
        ctx =>
          new Plugin({
            view: () => ({
              update(view, previous) {
                if (!disposed && !replacing && !view.state.doc.eq(previous.doc))
                  publish(ctx.get(serializerCtx)(view.state.doc))
              },
            }),
          }),
      ),
    )
    await instance.create()
    if (disposed) {
      await instance.destroy()
      return
    }
    editor = instance
    replace = text => instance?.editor.action(replaceAll(text))
    ready = true
    const editable = target.querySelector<HTMLElement>('[contenteditable=true]')
    editable?.setAttribute('aria-label', label)
    editable?.setAttribute('role', 'textbox')
    editable?.setAttribute('aria-multiline', 'true')
    editable?.focus({ preventScroll: true })
  })().catch(() => {
    if (!disposed) {
      error = 'Visual editor could not load. Markdown remains available.'
      source = true
    }
  })
  return () => {
    disposed = true
    observer.disconnect()
    editor = undefined
    replace = undefined
    if (ready) void instance?.destroy()
  }
})
$effect(() => {
  const next = value
  if (!editor || next === current) return
  replacing = true
  try {
    replace?.(next)
    current = next
  } finally {
    replacing = false
  }
})
/** Size source mode to the entire document, retaining the visual editor's height.
 * @returns Nothing; source edits and width changes never create an inner scrollbar.
 */
function fitSource(): void {
  if (!source || !control) return
  control.style.height = 'auto'
  sourceHeight = Math.max(sourceMinimum, control.scrollHeight + 2)
  control.style.height = `${sourceHeight}px`
}
$effect(() => {
  value
  if (!source) return
  void tick().then(fitSource)
  const observer = new ResizeObserver(fitSource)
  observer.observe(control)
  return () => observer.disconnect()
})
</script>

<div
  bind:this={root}
  class="{markdownEditorStyles} group/markdown min-w-0 rounded-md border border-t-0 border-border bg-background focus-within:border-primary"
  data-markdown-editor
>
  <div
    class="border-border group-focus-within/markdown:border-primary sticky z-20 -mx-px rounded-t-md border border-b-0 bg-[var(--form-workspace,var(--color-panel))]"
    style:top="calc(var(--profile-locale-toolbar-height, 0px) + var(--profile-field-header-height, 0px))"
    data-markdown-toolbar
  >
    <div class="border-border/40 flex flex-wrap items-center gap-1 border-b px-2 py-1">
      <button
        type="button"
        class="text-muted-foreground aria-pressed:text-foreground hover:bg-muted/40 focus-visible:outline-primary rounded px-2 py-1 text-xs focus-visible:outline-2 aria-pressed:font-medium"
        aria-pressed={!source}
        onclick={() => (source = false)}
      >
        Visual
      </button>
      <button
        type="button"
        class="text-muted-foreground aria-pressed:text-foreground hover:bg-muted/40 focus-visible:outline-primary rounded px-2 py-1 text-xs focus-visible:outline-2 aria-pressed:font-medium"
        aria-pressed={source}
        onclick={async () => {
          sourceMinimum = Math.max(192, host?.offsetHeight ?? 0)
          sourceHeight = sourceMinimum
          source = true
          await tick()
          fitSource()
          control.focus({ preventScroll: true })
        }}
      >
        Markdown
      </button>
      {#if toolbarActions}
        <div
          class="border-border/50 ml-1 min-w-0 border-l pl-2"
          data-markdown-translations
        >
          {@render toolbarActions()}
        </div>
      {/if}
      <button
        type="button"
        class="text-primary hover:bg-muted/40 focus-visible:outline-primary ml-auto rounded px-2 py-1 text-xs focus-visible:outline-2"
        onclick={onDone}
      >
        Done
      </button>
    </div>
    <!-- biome-ignore lint/a11y/useSemanticElements: Milkdown owns the dynamically mounted toolbar controls inside this labeled group. -->
    <div
      bind:this={toolbarSlot}
      class="milkdown"
      hidden={source}
      onkeydown={editorKeydown}
      role="group"
      aria-label="Formatting"
    ></div>
  </div>
  {#if error}
    <p role="status" class="text-destructive px-3 py-2 text-sm">{error}</p>
  {/if}
  <!-- This native control remains the sole submitted value in both editing modes. -->
  <textarea
    {...attrs}
    {value}
    bind:this={control}
    hidden={!source}
    aria-label={`${label} Markdown`}
    rows="1"
    style:height={`${sourceHeight}px`}
    class="min-h-48 w-full resize-none overflow-hidden bg-transparent p-3 font-mono text-sm outline-none"
    onkeydown={onCancel}
  ></textarea>
  {#if !source}
    <!-- biome-ignore lint/a11y/useSemanticElements: Milkdown mounts and labels the contenteditable textbox within this group. -->
    <div
      bind:this={host}
      class="min-w-0"
      class:invisible={!ready}
      class:absolute={!ready}
      class:w-full={!ready}
      onkeydown={editorKeydown}
      role="group"
      aria-label={label}
    ></div>
    {#if !ready}
      <div
        class="min-h-48 px-5 py-4"
        role="status"
        aria-label="Loading editor"
        aria-busy="true"
      >
        <LoadingSkeleton
          text={value || ' '}
          class="block break-words whitespace-pre-wrap"
        />
      </div>
    {/if}
  {/if}
</div>
