import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/HistoryHandoffFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('History handoff fixture target missing')
mount(Fixture, { target })
