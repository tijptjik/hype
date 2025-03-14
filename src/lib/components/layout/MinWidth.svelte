<script lang="ts">
let { viewportWidth }: { viewportWidth: number } = $props();
</script>

<div
  class="flex h-screen w-full items-center justify-center bg-base-100 p-4 caret-transparent">
  <div class="card w-full max-w-md border border-base-300 bg-base-200 shadow-xl">
    <div class="card-body text-center">
      <div class="mb-4 flex justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-16 w-16 text-warning"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          ></path>
        </svg>
      </div>
      <h2 class="card-title justify-center text-2xl font-bold">Window Too Small</h2>
      <p class="text-base-content/80">
        The admin panel requires a viewport width of at least 1200px to function
        properly. Please resize your browser window or use a larger screen.
      </p>
      <p class="mt-2 text-sm text-base-content/60">
        Current width: {viewportWidth}px
      </p>
      <div class="mt-4">
        <progress
          class="progress progress-warning w-full"
          value={viewportWidth}
          max="1200"
          aria-label="Progress toward minimum width requirement">
        </progress>
      </div>
    </div>
  </div>
</div>
