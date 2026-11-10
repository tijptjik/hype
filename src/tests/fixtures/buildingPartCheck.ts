import '#lib/styles/app.css'
import { mount } from 'svelte'
import Fixture from './components/BuildingPartFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture root')
mount(Fixture, { target })
