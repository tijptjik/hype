<script lang="ts">
import CameraIcon from 'virtual:icons/lucide/camera'
</script>

<div
  class="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[1.75rem] border border-dashed border-white/15 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.09),rgba(0,0,0,0.04)_48%),linear-gradient(180deg,rgba(16,17,20,0.84),rgba(8,9,11,0.94))] px-6 text-center text-white"
>
  <div class="space-y-2">
    <p class="font-mono text-[11px] uppercase tracking-[0.32em] text-white/55">
      Missing Image
    </p>
    <h3 class="text-2xl font-semibold tracking-[-0.03em] text-white">Add yours?</h3>
  </div>

  <button
    type="button"
    class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-white/92 backdrop-blur-sm"
  >
    <CameraIcon class="h-4 w-4" />
    add Photo
  </button>
</div>
