import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/LocaleSourceStripFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing locale source strip fixture target')
mount(Fixture, { target })
