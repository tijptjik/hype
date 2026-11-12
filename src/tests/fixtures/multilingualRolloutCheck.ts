import { mount } from 'svelte'
import Fixture from './components/MultilingualRolloutFixture.svelte'
import '#lib/styles/app.css'
mount(Fixture, { target: document.getElementById('app')! })
