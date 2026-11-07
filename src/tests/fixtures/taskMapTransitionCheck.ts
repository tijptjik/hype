import { mount } from 'svelte'
import TaskMap from '../../lib/bits/patterns/tasks/components/TaskMap.svelte'
import '../../lib/styles/app.css'
mount(TaskMap, {
  target: document.getElementById('app')!,
  props: {
    coordinates: [114.1705, 22.308],
    addressMeta: null,
    mapStyleCode: 'hyper',
    initialZoom: 16,
    expandOnClick: true,
  },
})
