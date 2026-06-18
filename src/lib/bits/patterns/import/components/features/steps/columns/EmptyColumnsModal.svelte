<script lang="ts">
// I18N
import { m } from '$lib/i18n'

type Props = {
  errors: string[]
  onEdit: () => void
  onSkip: () => void
}

let { errors, onEdit, onSkip }: Props = $props()
</script>

<div class="modal modal-open">
  <div class="modal-box">
    <h3 class="text-lg font-bold">
      {m.feature_import__empty_columns_title()}
    </h3>
    <div class="py-4">
      <p class="mb-4">
        {m.feature_import__empty_columns_intro()}
      </p>
      <ul class="mb-4 list-inside list-disc space-y-2">
        {#each errors as error}
          <li class="text-sm text-base-content/70">{error}</li>
        {/each}
      </ul>
      <p class="text-sm text-base-content/70">
        {m.feature_import__empty_columns_prompt()}
      </p>
    </div>
    <div class="modal-action">
      <button type="button" class="btn btn-ghost" onclick={onEdit}>
        {m.feature_import__empty_columns_edit_mapping()}
      </button>
      <button type="button" class="btn btn-primary" onclick={onSkip}>
        {m.feature_import__empty_columns_skip()}
      </button>
    </div>
  </div>
</div>
