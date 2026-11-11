import { mount } from 'svelte'
import Fixture from './components/DisplayTemplateFixture.svelte'
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture root')
mount(Fixture, { target })
