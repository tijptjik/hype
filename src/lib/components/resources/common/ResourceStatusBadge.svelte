<script lang="ts">
import { m } from '$lib/i18n';
let {
  isPublished,
  isPendingReview
}: { isPublished: boolean; isPendingReview: boolean } = $props();
</script>

<span
  class="badge w-[100px] rounded-lg border-none bg-glass-neutral px-3 py-5 text-xs uppercase"
  class:text-orange-500={isPendingReview}
  class:text-ok={isPublished}
  class:text-error={!isPublished && !isPendingReview}>
  {isPendingReview
    ? m.tangy_zany_capybara_arise()
    : isPublished
      ? m.published()
      : m.weak_super_guppy_nail()}
</span>
