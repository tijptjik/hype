<script lang="ts">
// BITS COMPONENTS
import ChoiceDialog from '#lib/bits/core/dialog/ChoiceDialog.svelte'
import Button from '#lib/bits/core/button/Button.svelte'
// I18N
import { m } from '#lib/i18n.js'

let {
  resourceType,
  mode = 'publish',
  onChoice,
  onCancel,
}: {
  resourceType: 'organisation' | 'project' | 'layer'
  mode?: 'publish' | 'preview'
  onChoice: (publishChildren: boolean) => void | Promise<void>
  onCancel: () => void
} = $props()

const description = $derived(
  resourceType === 'organisation'
    ? m.publish_children__organisation()
    : resourceType === 'project'
      ? m.publish_children__project()
      : m.publish_children__layer(),
)
</script>

<ChoiceDialog
  title={mode === 'preview'
    ? m.publication_preview__title()
    : m.publish_children__title()}
  description={mode === 'preview' ? m.publication_preview__description() : description}
  {onCancel}
>
  <div class="flex w-full flex-col gap-3">
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Button
        text={mode === 'preview'
          ? m.publication_preview__parent_only()
          : m.publish_children__parent_only()}
        color="neutral"
        style="outline"
        class="w-full justify-center"
        onClick={() => onChoice(false)}
      />
      <Button
        text={mode === 'preview'
          ? m.publication_preview__all()
          : m.publish_children__all()}
        color="success"
        class="w-full justify-center"
        onClick={() => onChoice(true)}
      />
    </div>
    <div class="flex justify-end">
      <Button text={m.cancel()} color="neutral" style="ghost" onClick={onCancel} />
    </div>
  </div>
</ChoiceDialog>
