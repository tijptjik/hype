<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ImportDropzone from './Dropzone.svelte'
import CloudArrowUp from 'virtual:icons/lucide/cloud-upload'
import UserGroup from 'virtual:icons/lucide/users'
import CalendarDays from 'virtual:icons/lucide/calendar-days'
import TableCells from 'virtual:icons/lucide/table-cells-split'
// TYPES
import type { DropzoneEvent } from './types.ts'
import Heading from '$lib/bits/custom/text/Heading.svelte'
import Subheading from '$lib/bits/custom/text/Subheading.svelte'

// TYPES
type Props = {
  onDrop: (event: DropzoneEvent) => void
  isUploading: boolean
  uploadProgress: string
}

let { onDrop, isUploading, uploadProgress }: Props = $props()
</script>

<Heading level={4}>{m.import_data()}</Heading>
<Subheading level={4} class="pb-4">{m.import_data_csv_only()}</Subheading>

<div class="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
  <ImportDropzone
    type="features"
    title={m.omni__title_features()}
    subtitle={m.import_data_subtitle()}
    icon={TableCells}
    accept={['.csv']}
    multiple={false}
    ondrop={onDrop}
  />

  <ImportDropzone
    type="users"
    title={m.import_data_images()}
    subtitle={m.import_coming_soon()}
    icon={UserGroup}
    accept={['.csv']}
    multiple={false}
    disabled={true}
    ondrop={onDrop || (() => {})}
  />

  <ImportDropzone
    type="events"
    title={m.import_data_events()}
    subtitle={m.import_coming_soon()}
    icon={CalendarDays}
    accept={['.csv']}
    multiple={false}
    disabled={true}
    ondrop={onDrop || (() => {})}
  />
</div>

<Heading level={4}>{m.import_batch_image()}</Heading>
<Subheading level={4} class="pb-4">{m.import_batch_image_description()}</Subheading>

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
  ondrop={onDrop}
  onselect={onDrop}
/>
