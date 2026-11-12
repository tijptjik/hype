import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/HeaderViewSwitchFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Header view-switch fixture target missing')
mount(Fixture, { target })
