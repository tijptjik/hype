<script lang="ts">
// COMPONENTS
import GuestProfileMapBackground from './GuestProfileMapBackground.svelte'

let { isGuest = false }: { isGuest?: boolean } = $props()
</script>

{#if isGuest}
  <GuestProfileMapBackground />
{:else}
  <div
    class="profile-section-background pointer-events-none absolute inset-x-0 top-0 z-0 flex h-85 items-center justify-center overflow-hidden px-1.5"
    aria-hidden="true"
  >
    <div class="profile-section-background__neon">
      <svg viewBox="0 0 362 340" class="h-full w-full object-cover" focusable="false">
        <title>Neon globe pattern</title>
        <defs>
          <filter id="profile-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="181"
          cy="170"
          r="151"
          fill="none"
          stroke="var(--theme-primary)"
          stroke-width="2"
          filter="url(#profile-glow)"
          opacity=".8"
        ></circle>
        <circle
          cx="181"
          cy="170"
          r="126"
          fill="none"
          stroke="var(--theme-primary)"
          stroke-width="1"
          opacity=".65"
        ></circle>
        <path
          d="M42 120C89 87 111 171 154 133S220 61 270 111s23 119 63 146M20 224c41-55 83 42 126 3s67-88 112-49 48 92 86 55"
          fill="none"
          stroke="var(--theme-primary)"
          stroke-width="2"
          filter="url(#profile-glow)"
          opacity=".65"
        ></path>
        <circle
          cx="181"
          cy="170"
          r="18"
          fill="none"
          stroke="var(--theme-primary)"
          stroke-width="2"
          filter="url(#profile-glow)"
          opacity=".8"
        ></circle>
      </svg>
    </div>

    <div class="profile-section-background__breadline">
      <svg viewBox="0 0 362 340" class="h-full w-full object-cover" focusable="false">
        <title>Pattern of croissants</title>
        <defs>
          <pattern
            id="breadline-croissants"
            width="116"
            height="92"
            patternUnits="userSpaceOnUse"
          >
            <g
              transform="translate(15 15) rotate(-12 38 24)"
              fill="none"
              stroke="var(--theme-primary)"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M5 29C10 11 23 4 36 8C50 12 60 23 71 39C57 34 48 34 39 39C29 44 18 44 11 39C5 35 3 32 5 29Z"
                fill="var(--theme-tertiary)"
                stroke-width="2.5"
              ></path>
              <path
                d="M12 29C22 23 33 22 43 25C53 28 62 33 70 39"
                stroke="var(--theme-primary)"
                stroke-width="2"
              ></path>
              <path
                d="M20 14L16 31M30 10L27 29M41 13L38 30M52 19L49 33M61 27L58 36"
                stroke="var(--theme-primary)"
                stroke-width="1.5"
                opacity=".8"
              ></path>
            </g>
          </pattern>
        </defs>
        <rect
          width="362"
          height="340"
          fill="url(#breadline-croissants)"
          opacity=".48"
        ></rect>
        <path
          d="M-20 268C55 232 97 293 162 263S276 232 382 270"
          fill="none"
          stroke="var(--theme-secondary)"
          stroke-width="2"
          opacity=".25"
        ></path>
      </svg>
    </div>
  </div>
{/if}

<style>
.profile-section-background__breadline {
  display: none;
  width: 100%;
  height: 100%;
}

:global([data-theme="breadline-light"]) .profile-section-background__neon,
:global([data-theme="breadline-dark"]) .profile-section-background__neon {
  display: none;
}

:global([data-theme="breadline-light"]) .profile-section-background__breadline,
:global([data-theme="breadline-dark"]) .profile-section-background__breadline {
  display: block;
}
</style>
