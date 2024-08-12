/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,svelte,js,ts}'],
	theme: {
		extend: {}
	},
	daisyui: {
		themes: ['dark', 'emerald']
	},
	plugins: [require('@tailwindcss/typography'), require('daisyui')]
};

