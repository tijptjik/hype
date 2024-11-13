<script lang="ts">
type Props = {
  checked: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange: () => void;
};

let { checked, size = 'lg', onChange }: Props = $props();
</script>

<label class="label cursor-pointer">
  <input type="checkbox" class="toggle toggle-primary toggle-{size}" {checked} onchange={onChange} />
</label>
