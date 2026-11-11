<script lang="ts">
// BITS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import { UserCard } from '#lib/bits/patterns/cards/userCard/index.js'
let { count = 3 }: { count?: number } = $props()
</script>

<div aria-hidden="true">
  <div
    class="border-border text-muted-foreground mx-6 mt-4 flex justify-between border-b px-3 py-2 text-xs font-medium"
  >
    <span>Name</span
    ><span class="mr-10 w-24 pr-9 text-right @min-[40rem]:w-36">Role</span>
  </div>
  {#each Array(count) as _, index (index)}
    <div class="border-border min-w-0 border-b last:border-b-0">
      <UserCard.Root class="bits-form__user-card-root--full border-b-0! py-2">
        <Skeleton class="size-8 shrink-0 rounded-full" />
        <!-- Preserve the loaded card's two-line identity typography and intrinsic height. -->
        <ContentSkeleton
          class="[&_.bits-card\_\_title-text]:bg-foreground/10 [&_a]:bg-foreground/10 min-w-0 flex-1"
        >
          <UserCard.Body wrapTitle name="Member" username="user" />
        </ContentSkeleton>
        <div class="flex w-36 shrink-0 justify-end pr-9">
          <Skeleton class="h-3 w-14" />
        </div>
        <div class="size-10 shrink-0"></div>
      </UserCard.Root>
    </div>
  {/each}
</div>
