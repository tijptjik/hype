<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import ImportDropzone from '$lib/components/import/Dropzone.svelte';
import {
  CloudArrowUp,
  UserGroup,
  CalendarDays,
  TableCells
} from '@steeze-ui/heroicons';

// TYPES
type Props = {
  onFeaturesDrop: (event: CustomEvent) => void;
  onUsersDrop?: (event: CustomEvent) => void;
  onEventsDrop?: (event: CustomEvent) => void;
  onImagesDrop: (event: CustomEvent) => void;
  isUploading: boolean;
  uploadProgress: string;
};

let {
  onFeaturesDrop,
  onUsersDrop,
  onEventsDrop,
  onImagesDrop,
  isUploading,
  uploadProgress
}: Props = $props();
</script>

<!-- CSV Import Section -->
<div class="flex-none">
  <div class="mb-6">
    <h3 class="mb-2 text-xl font-bold">Import Data</h3>
    <p class="mb-4 text-sm text-base-content/70">Only CSV files are accepted.</p>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <!-- Features Dropzone -->
      <ImportDropzone
        type="features"
        title="Features"
        subtitle="Drop CSV with a header row"
        icon={TableCells}
        accept={['.csv']}
        multiple={false}
        on:drop={onFeaturesDrop} />

      <!-- Users Dropzone (Disabled) -->
      <ImportDropzone
        type="users"
        title="Users"
        subtitle="Coming Soon"
        icon={UserGroup}
        accept={['.csv']}
        multiple={false}
        disabled={true}
        on:drop={onUsersDrop || (() => {})} />

      <!-- Events Dropzone (Disabled) -->
      <ImportDropzone
        type="events"
        title="Events"
        subtitle="Coming Soon"
        icon={CalendarDays}
        accept={['.csv']}
        multiple={false}
        disabled={true}
        on:drop={onEventsDrop || (() => {})} />
    </div>
  </div>
</div>

<!-- Image Upload Section -->
<div class="mb-0">
  <h3 class="mb-2 text-xl font-bold">Batch Image Upload</h3>
  <p class="text-sm text-base-content/70">
    {m.caring_aloof_haddock_bubble()}
  </p>
</div>

<!-- Dropzone -->
<div class="flex-1">
  <ImportDropzone
    type="images"
    title={m.maroon_teary_warbler_nourish()}
    subtitle={m.teal_dizzy_finch_file()}
    icon={CloudArrowUp}
    accept={['image/*']}
    multiple={true}
    disabled={isUploading}
    {isUploading}
    {uploadProgress}
    on:drop={onImagesDrop}
    on:select={onImagesDrop} />
</div>
