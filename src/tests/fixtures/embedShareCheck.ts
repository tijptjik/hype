import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/EmbedShareFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing embed fixture target')
mount(Fixture, { target })
