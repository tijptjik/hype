<script lang="ts">
let {
  label = 'Loading preview',
  compact = false,
}: { label?: string; compact?: boolean } = $props()
</script>
<section
  aria-label={label}
  class="relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-surface motion-safe:animate-pulse {compact
    ? 'h-16'
    : 'aspect-square'}"
>
  <div aria-hidden="true" class="h-2/5 w-2/5 rounded-xl bg-base-content/5"></div>
  <div
    aria-hidden="true"
    class="absolute inset-0 bg-gradient-to-br from-transparent via-base-content/5 to-transparent"
  ></div>
</section>
