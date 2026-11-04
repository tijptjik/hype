<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import TgsSticker from './TgsSticker.svelte'
let { url, mimeType, label }: { url: string; mimeType: string; label: string } = $props()
let frame: HTMLDivElement
let video = $state<HTMLVideoElement>()
let visible = $state(true), reduced = $state(false)
onMount(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const update = (): void => { reduced = motion.matches }
  update(); motion.addEventListener('change', update)
  if (typeof IntersectionObserver === 'undefined') return () => motion.removeEventListener('change', update)
  const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting) })
  observer.observe(frame)
  return () => { observer.disconnect(); motion.removeEventListener('change', update) }
})
$effect(() => { if (video) { if (visible && !reduced) void video.play().catch(() => {}); else video.pause() } })
</script>

<div bind:this={frame} class="flex h-full w-full items-center justify-center">
{#if mimeType === 'application/x-tgsticker'}
  <TgsSticker {url} {label} playing={visible && !reduced} />
{:else if mimeType.startsWith('video/')}
  <video bind:this={video} src={url} loop muted playsinline preload="metadata" aria-label={label} class="h-full w-full object-contain"><track kind="captions" /></video>
{:else}
  <img src={url} alt={label} loading="lazy" class="h-full w-full object-contain" />
{/if}
</div>
