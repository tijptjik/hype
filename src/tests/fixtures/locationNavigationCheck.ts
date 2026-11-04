import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/LocationNavigationFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
mount(Fixture, { target })
