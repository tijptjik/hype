// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/DescriptorProfileFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing descriptor fixture target')
mount(Fixture, { target })
