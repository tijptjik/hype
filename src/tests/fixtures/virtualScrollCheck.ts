import { mount } from 'svelte'
import Fixture from './components/VirtualScrollFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
mount(Fixture, { target })
