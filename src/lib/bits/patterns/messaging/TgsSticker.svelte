<script lang="ts">
// MEDIA
import { stickerPlayer } from '#lib/messaging/sticker-player.js'
import { decodeTelegramSticker } from '#lib/messaging/tgs.js'
// TYPES
import type { AnimationItem } from 'lottie-web'

let {
  url,
  label = 'Animated sticker',
  playing = true,
}: { url: string; label?: string; playing?: boolean } = $props()
let player = $state.raw<AnimationItem>()
$effect(() => {
  if (playing) player?.play()
  else player?.pause()
})
let container: HTMLDivElement
let error = $state('')

$effect(() => {
  const source = url
  let disposed = false
  let animation: AnimationItem | undefined
  const controller = new AbortController()
  error = ''
  // The light player contains no expression evaluator; only validated vector data reaches it.
  void (async () => {
    const response = await fetch(source, { signal: controller.signal })
    if (!response.ok) throw new Error('Sticker preview unavailable')
    const data = await decodeTelegramSticker(
      new Uint8Array(await response.arrayBuffer()),
    )
    if (disposed || !stickerPlayer) return
    animation = stickerPlayer.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: false,
      animationData: data,
      rendererSettings: { progressiveLoad: true },
    })
    player = animation
    animation.addEventListener('data_failed', () => {
      if (!disposed) error = 'Sticker preview unavailable'
    })
  })().catch(() => {
    if (!disposed) error = 'Sticker preview unavailable'
  })
  return () => {
    disposed = true
    controller.abort()
    animation?.destroy()
  }
})
</script>

<section
  bind:this={container}
  aria-label={label}
  class="h-full w-full [&>svg]:max-h-full [&>svg]:max-w-full"
></section>
{#if error}
  <span class="text-xs text-muted-foreground">{error}</span>
{/if}
