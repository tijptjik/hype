<script lang="ts">
const { label, href, isActive } = $props<{ label: string; href: string; isActive: boolean }>();
</script>

<li class="group">
  <a
    href={href}
    class="flex flex-col items-center uppercase px-4 py-2 transition-colors duration-200 ease-in-out hover:bg-transparent"
    class:active={isActive}
  >
    <span>{label}</span>
    <span class="w-full h-0.25 mt-1 transition-colors duration-200 ease-in-out {isActive ? 'bg-white' : 'bg-transparent group-hover:bg-white'}"></span>
  </a>
</li>
