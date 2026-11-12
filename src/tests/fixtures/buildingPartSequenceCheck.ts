import { mount } from 'svelte'
import Fixture from './components/BuildingPartSequenceFixture.svelte'
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture mount target')
mount(Fixture, { target })
