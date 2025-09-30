<script lang="ts">
// I18N
import { m } from '$lib/i18n';

// TYPES
type Props = {
  successCount: number;
  errorCount: number;
  uploadingCount: number;
  pendingCount: number;
};

let { successCount, errorCount, uploadingCount, pendingCount }: Props = $props();
</script>

<div class="card bg-glass-result">
  <div class="card-body">
    <h3 class="card-title text-lg">{m.batch_upload__progress()}</h3>
    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div class="stat">
        <div class="stat-title">{m.batch_upload__success()}</div>
        <div class="stat-value text-glass-accepted">{successCount}</div>
      </div>
      <div class="stat">
        <div class="stat-title">{m.batch_upload__errors()}</div>
        <div class="stat-value text-glass-rejected">{errorCount}</div>
      </div>
      <div class="stat">
        <div class="stat-title">{m.batch_upload__uploading()}</div>
        <div class="stat-value text-glass-100">{uploadingCount}</div>
      </div>
      <div class="stat">
        <div class="stat-title">{m.batch_upload__pending()}</div>
        <div class="stat-value text-glass-100">{pendingCount}</div>
      </div>
    </div>
  </div>
</div>
