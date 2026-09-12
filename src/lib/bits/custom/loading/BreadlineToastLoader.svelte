<script lang="ts">
const biteMarks = [
  { x: 157, y: 56, radius: 14, delay: '0s' },
  { x: 145, y: 76, radius: 14, delay: '0.36s' },
  { x: 130, y: 95, radius: 14, delay: '0.72s' },
  { x: 111, y: 111, radius: 13, delay: '1.08s' },
  { x: 90, y: 121, radius: 12, delay: '1.44s' },
] as const
</script>

<div class="bits-load-screen__breadline" role="status" aria-label="Loading">
  <svg viewBox="0 0 210 165" aria-hidden="true">
    <defs>
      <mask
        id="bits-load-screen-toast-mask"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="210"
        height="165"
      >
        <rect width="210" height="165" fill="black" />
        <path
          fill="white"
          d="M44 119c-4-7-5-15-4-25l6-45c2-19 13-30 31-32l57 3c19 1 31 12 31 31l-2 48c0 18-9 29-27 32l-62 1c-13 0-23-4-30-13Z"
        />
        <g class="bits-load-screen__bite-marks">
          {#each biteMarks as bite}
            <circle
              cx={bite.x}
              cy={bite.y}
              r={bite.radius}
              fill="black"
              style:animation-delay={bite.delay}
            />
          {/each}
        </g>
      </mask>
    </defs>
    <!-- The mask progressively removes bites from the toast, then lets it re-enter on the next cycle. -->
    <g class="bits-load-screen__toast-art">
      <g mask="url(#bits-load-screen-toast-mask)">
        <path
          class="bits-load-screen__toast-shadow"
          d="M48 126c-5-6-7-14-6-25l6-49c2-18 13-29 31-31l57 3c19 1 31 12 31 31l-2 51c0 19-10 30-28 33l-62 1c-12 0-21-5-27-14Z"
        />
        <path
          class="bits-load-screen__toast-crust"
          d="M44 119c-4-7-5-15-4-25l6-45c2-19 13-30 31-32l57 3c19 1 31 12 31 31l-2 48c0 18-9 29-27 32l-62 1c-13 0-23-4-30-13Z"
        />
        <path
          class="bits-load-screen__toast-crumb"
          d="M57 113c-3-5-4-11-3-18l5-43c1-12 8-20 21-21l52 3c12 1 19 8 19 21l-2 42c0 12-6 19-19 21l-55 1c-8 0-14-2-18-6Z"
        />
        <path
          class="bits-load-screen__toast-highlight"
          d="m69 47 46 2c10 0 15 4 17 12-18-4-38-5-59-2-8 1-12-3-4-12Z"
        />
      </g>
      <g class="bits-load-screen__crumbs" aria-hidden="true">
        <circle cx="172" cy="39" r="2.5" />
        <circle cx="180" cy="46" r="1.5" />
        <circle cx="159" cy="128" r="2" />
      </g>
    </g>
  </svg>
</div>

<style>
.bits-load-screen__breadline {
  display: none;
  height: 8rem;
  width: 10rem;
}

:global(html[data-theme^="breadline-"]) .bits-load-screen__breadline {
  display: block;
}

.bits-load-screen__breadline svg {
  display: block;
  height: 100%;
  width: 100%;
  overflow: visible;
}

.bits-load-screen__toast-art {
  transform-box: fill-box;
  transform-origin: center;
  animation: bits-load-screen-toast-cycle 5.4s ease-in-out infinite;
}

.bits-load-screen__toast-shadow {
  fill: color-mix(in srgb, var(--color-primary) 18%, transparent);
  transform: translate(2px, 4px);
}

.bits-load-screen__toast-crust {
  fill: color-mix(in srgb, var(--color-primary) 74%, #71351f);
  stroke: var(--color-primary);
  stroke-width: 2.5;
}

.bits-load-screen__toast-crumb {
  fill: color-mix(in srgb, var(--color-warning) 72%, #f6d28f);
}

.bits-load-screen__toast-highlight {
  fill: color-mix(in srgb, white 44%, transparent);
}

.bits-load-screen__bite-marks circle {
  opacity: 0;
  stroke-width: 4;
  transform-box: fill-box;
  transform-origin: center;
  animation: bits-load-screen-bite 5.4s ease-out infinite;
  animation-delay: var(--bite-delay, 0s);
}

.bits-load-screen__crumbs circle {
  fill: var(--color-warning);
  animation: bits-load-screen-crumbs 5.4s ease-in-out infinite;
}

@keyframes bits-load-screen-toast-cycle {
  0%,
  8% {
    opacity: 0;
    transform: scale(0.68);
  }

  18%,
  70% {
    opacity: 1;
    transform: scale(1);
  }

  82%,
  100% {
    opacity: 0;
    transform: scale(0.76);
  }
}

@keyframes bits-load-screen-bite {
  0%,
  10% {
    opacity: 0;
    transform: scale(0.35);
  }

  18%,
  74% {
    opacity: 1;
    transform: scale(1);
  }

  82%,
  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}

@keyframes bits-load-screen-crumbs {
  0%,
  15%,
  78%,
  100% {
    opacity: 0;
    transform: translate(0, 0) scale(0.5);
  }

  28%,
  60% {
    opacity: 0.75;
    transform: translate(5px, -5px) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bits-load-screen__toast-art,
  .bits-load-screen__bite-marks circle,
  .bits-load-screen__crumbs circle {
    animation: none;
  }

  .bits-load-screen__toast-art {
    opacity: 1;
    transform: none;
  }

  .bits-load-screen__bite-marks circle,
  .bits-load-screen__crumbs circle {
    opacity: 0;
  }
}
</style>
