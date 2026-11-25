<script lang="ts">
// I18N
import { t } from './i18n'
</script>

<div
  role="status"
  aria-label={t('loading_building_model')}
  class="bg-panel absolute inset-0 grid place-items-center"
>
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 200 180"
    class="text-accent h-auto max-h-full w-44 max-w-full"
    stroke-linejoin="round"
  >
    <!-- A survey footprint stays fixed as the floor plates lift apart. -->
    <g fill="none" stroke="currentColor" stroke-opacity=".38">
      <path d="m22 130 75-34 81 26-75 35z" stroke-dasharray="2 4" />
      <path d="m18 128 4 2 5-2m71 27 5 2 5-2m66-35 4 2-5 2" />
    </g>
    {#each [0, 1, 2, 3, 4] as floor (floor)}
      <g transform={'translate(100 ' + (139 - 13 * floor) + ')'}>
        <g
          data-floor={floor}
          style:--lift={-(floor + 1) * 3 + 'px'}
          style:animation-delay={floor * 75 + 'ms'}
        >
          <!-- Two shaded elevations and a roof share the same asymmetrical footprint. -->
          <path d="m-52-18 58 19v7l-58-19z" fill="var(--theme-primary)" />
          <path d="m6 1 46-21v7L6 8z" fill="var(--theme-secondary)" />
          <path
            d="m-52-18 46-21 58 19L6 1z"
            fill="var(--theme-surface)"
            stroke="currentColor"
            stroke-width="1.35"
          />
          <path
            d="m-40-12 29 9.5m28 1.5 24-11"
            fill="none"
            stroke="var(--theme-panel)"
            stroke-width="2"
          />
          {#if floor === 4}
            <g stroke="currentColor" fill="var(--theme-raised)">
              <path d="m-15-23 19-9 22 7-19 9z" />
              <path d="m-15-23 22 7v5l-22-7zM7-16l19-9v5l-19 9z" />
            </g>
          {/if}
        </g>
      </g>
    {/each}
  </svg>
</div>

<style>
@media (prefers-reduced-motion: no-preference) {
  [data-floor] {
    animation: lift-floor 2.8s ease-in-out infinite;
  }
}
@keyframes lift-floor {
  0%,
  80%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(var(--lift));
  }
}
</style>
