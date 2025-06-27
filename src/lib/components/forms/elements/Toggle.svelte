<script lang="ts">
type Props = {
  label: string;
  checked: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange: (e: Event) => void;
};

let { label, checked, size = 'lg', onChange }: Props = $props();
</script>

<label class="label flex cursor-pointer gap-2">
  <p class="text-sm font-bold">{label}</p>
  <input
    type="checkbox"
    class="toggle toggle-primary toggle-{size} green border-3 bg-slate-300 checked:border-white/60 checked:bg-glass-salmon"
    style="--tglbg: #2b092282;"
    {checked}
    onchange={onChange} />
</label>
