<script lang="ts">
// I18N
import { m } from '$lib/i18n'

type Props = {
  progress: number
  total: number
}

let { progress, total }: Props = $props()
</script>

<div class="mb-6">
  <div class="mb-2 flex items-center justify-between text-sm">
    <span>{m.feature_import__users_validating()}</span>
    <span> {progress}/{total} </span>
  </div>
  <progress
    class="progress progress-primary w-full"
    value={progress}
    max={total}
  ></progress>
</div>
