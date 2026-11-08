<script lang="ts">
let {
  local,
  remote,
  cameraOff,
}: { local: MediaStream | null; remote: MediaStream | null; cameraOff: boolean } =
  $props()
let localElement: HTMLVideoElement
let remoteElement: HTMLVideoElement
$effect(() => {
  if (localElement) localElement.srcObject = local
})
$effect(() => {
  if (remoteElement) remoteElement.srcObject = remote
})
</script>

<section
  class="border-border relative aspect-video overflow-hidden rounded-xl border bg-black"
  aria-label="Video call"
>
  <video
    bind:this={remoteElement}
    autoplay
    muted
    playsinline
    class="h-full w-full object-contain"
    aria-label="Contact’s video"
  >
    <track kind="captions">
  </video>
  {#if !remote}
    <p
      role="status"
      class="absolute inset-0 flex items-center justify-center text-sm text-white"
    >
      Waiting for video…
    </p>
  {/if}
  <div
    class="absolute right-2 bottom-2 aspect-video w-1/3 overflow-hidden rounded-lg border border-white/30 bg-black shadow-lg"
  >
    <video
      bind:this={localElement}
      autoplay
      muted
      playsinline
      class="h-full w-full -scale-x-100 object-contain"
      aria-label="Your camera preview"
    >
      <track kind="captions">
    </video>
    {#if cameraOff}
      <p
        class="absolute inset-0 flex items-center justify-center bg-black text-xs text-white"
      >
        Camera off
      </p>
    {/if}
  </div>
</section>
