import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/AddressModeTransitionFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture mount target')
mount(Fixture, { target })
