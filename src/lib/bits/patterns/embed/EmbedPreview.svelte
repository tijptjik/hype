<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'

// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import PhoneIcon from 'virtual:icons/lucide/smartphone'
import DesktopIcon from 'virtual:icons/proicons/computer'

let {
  src,
  frame = $bindable(),
  perspective,
}: {
  src: string
  frame?: HTMLIFrameElement
  perspective?: Snippet
} = $props()
let device = $state<'mobile' | 'desktop'>('desktop')
let availableWidth = $state(0)
const width = $derived(device === 'mobile' ? 390 : 1280)
const height = $derived(device === 'mobile' ? 844 : 800)
// Resize the presentation, not the iframe viewport: the real responsive breakpoints still apply.
const scale = $derived(
  Math.min(1, Math.max(1, availableWidth - 24) / width, 560 / height),
)
</script>

<section class="min-w-0" aria-label="Device preview">
  <div class="mb-3 flex flex-wrap items-start gap-x-6 gap-y-3">
    {#if perspective}
      <fieldset>
        <legend class="text-muted-foreground mb-2 text-xs font-semibold">
          Perspective
        </legend>
        {@render perspective()}
      </fieldset>
    {/if}
    <fieldset>
      <legend class="text-muted-foreground mb-2 text-xs font-semibold">Preview</legend>
      <div class="flex gap-2">
        <Button
          text="Desktop"
          iconComponent={DesktopIcon}
          size="sm"
          style={device === 'desktop' ? 'soft' : 'outline'}
          attrs={{ 'aria-pressed': device === 'desktop' }}
          onClick={() => {
            device = 'desktop'
          }}
        />
        <Button
          text="Mobile"
          iconComponent={PhoneIcon}
          size="sm"
          style={device === 'mobile' ? 'soft' : 'outline'}
          attrs={{ 'aria-pressed': device === 'mobile' }}
          onClick={() => {
            device = 'mobile'
          }}
        />
      </div>
    </fieldset>
    <span class="text-muted-foreground ml-auto self-end pb-2 text-xs"
      >{width}
      × {height} · {Math.round(scale * 100)}%</span
    >
  </div>
  <div
    bind:clientWidth={availableWidth}
    class="bg-canvas flex w-full justify-center rounded-xl py-3"
  >
    {#if src}
      <div
        class="relative shrink-0 overflow-hidden border border-border bg-panel shadow-sm motion-safe:transition-[width,height,border-radius] motion-safe:duration-300 motion-safe:ease-in-out {device ===
        'mobile'
          ? 'rounded-3xl'
          : 'rounded-lg'}"
        style:width={`${width * scale}px`}
        style:height={`${height * scale}px`}
      >
        <iframe
          bind:this={frame}
          {src}
          title="Embed preview"
          class="absolute top-0 left-0 max-w-none origin-top-left border-0 motion-safe:transition-[width,height,transform] motion-safe:duration-300 motion-safe:ease-in-out"
          style:width={`${width}px`}
          style:height={`${height}px`}
          style:transform={`scale(${scale})`}
        ></iframe>
      </div>
    {:else}
      <p class="text-muted-foreground py-12 text-sm">
        Include at least one layer to preview.
      </p>
    {/if}
  </div>
</section>
