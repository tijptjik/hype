<script lang="ts">
interface Props {
  title: string;
  value: string;
  textWrap?: boolean;
}

const { title, value, textWrap = false }: Props = $props();
</script>

<div class="stat flex flex-col gap-2 p-0">
  <div class="text stat-title">{title}</div>
  <div
    class="stat-value rounded-lg bg-glass-100 px-4 py-1 text-[1rem] font-normal"
    class:text-wrap={textWrap}
    style="line-height: 26px">
    {value}
  </div>
</div>
