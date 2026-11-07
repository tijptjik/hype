import { mount } from 'svelte'
import Fixture from './components/NewFeatureReviewFixture.svelte'
import '#lib/styles/app.css'
mount(Fixture, { target: document.getElementById('app')! })
