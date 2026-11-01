import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/UserDirectoryControlsFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing user controls fixture root')
mount(Fixture, { target })
