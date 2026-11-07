// SVELTE
import { mount } from 'svelte'
// FIXTURE
import Fixture from './components/MapStylePickerVisualFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing Quercus picker fixture target')
mount(Fixture, { target })
