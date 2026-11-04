<script lang="ts">
let { class: className = '' }: { class?: string } = $props()
</script>

<!-- Reuse the admin header's HYPE mark, tinted to match the surrounding control. -->
<span
  class={`block size-4 bg-current [mask-image:url('/logos/hype-mark.svg')] [mask-size:160%] [mask-position:center] [mask-repeat:no-repeat] ${className}`}
  aria-hidden="true"
></span>
