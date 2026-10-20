<script lang="ts">
// SVELTE
import type { HTMLAttributes } from 'svelte/elements'

let {
  class: className,
  'aria-label': label = 'Loading',
  ...restProps
}: HTMLAttributes<HTMLDivElement> = $props()
</script>

<div
  {...restProps}
  class={['h-32 w-32 text-(--bits-load-screen-color)', className]}
  role="status"
  aria-label={label}
>
  <svg
    class="block h-full w-full overflow-visible"
    viewBox="0 0 512 512"
    fill="none"
    aria-hidden="true"
  >
    <!-- Keep the original logo as a quiet anchor; reduced motion retains the complete mark. -->
    <path
      class="mark"
      fill="currentColor"
      fill-rule="evenodd"
      d="M105 105H407V329H187V188H325V285H363V149H149V367H363V411H105ZM231 232V285H280V232Z"
    />
    <!-- Continue the logo's square spiral beyond its open end, keeping the entire stroke inside the frame. -->
    <svg
      class="trail"
      x="0"
      y="0"
      width="512"
      height="512"
      viewBox="0 0 512 512"
      aria-hidden="true"
    >
      <path
        d="M303 285V210H209V307H385V127H127V389H457V55H55V461H457"
        pathLength="1000"
        stroke="currentColor"
        stroke-width="44"
        stroke-linecap="butt"
        stroke-linejoin="miter"
      />
    </svg>
  </svg>
</div>

<style>
.mark {
  opacity: 0.14;
}

.trail {
  overflow: hidden;
  animation: appear 220ms ease-out both;
}

.trail path {
  /* The first dash covers exactly the original spiral before its outward extension. */
  stroke-dasharray: 456.896552 543.103448;
  stroke-dashoffset: 0;
  animation: snake-out 3.8s linear infinite;
}

@keyframes appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes snake-out {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -1000;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mark {
    opacity: 1;
    animation: none;
  }
  .trail {
    display: none;
    animation: none;
  }
  .trail path {
    animation: none;
  }
}
</style>
