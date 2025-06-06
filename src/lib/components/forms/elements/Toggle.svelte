<script lang="ts">
type Props = {
  label: string;
  checked: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange: (e: Event) => void;
};

let { label, checked, size = 'lg', onChange }: Props = $props();
</script>

<label class="label cursor-pointer flex gap-3">
  <p class="text-sm font-light">{label}</p>
  <input
    type="checkbox"
    class="toggle toggle-primary toggle-{size}"
    {checked}
    onchange={onChange} />
</label>
