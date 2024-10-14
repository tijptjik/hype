/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,svelte,js,ts}'],
  theme: {
    fontFamily: {
      sans: ['IBM Plex Sans', 'sans-serif'],
      serif: ['Merriweather', 'serif'],
      mono: ['IBM Plex Mono', 'monospace'],
    },
    extend: {
      borderStyle: ['hover'],
      borderWidth: {
        '1': '1px',
        '3': '3px',
      },
      colors: {
        'gradient-end': 'hsl(var(--fuchsia-800))', // color-variable
        'gradient-start': 'hsl(var(--rose-500))', // color-variable
        'secondary': '#7482FF' // color-variable
      },
      fontSize: {
        '2xs': '0.625rem',
        '3xs': '0.55rem'
      },
      height: {
        '0.25': '0.0625rem',
        '17.5': '4.375rem',
      }
    }
  },
  // daisyUI config
  daisyui: {
    logs: false, // Shows info about daisyUI version and used config in the console when building your CSS
    themes: [
      {
        spectre: {
          // Colours
          primary: '#F04D7F',
          'primary-content': '#D4DBFF',
          secondary: '#D653B9',
          'secondary-content': '#190211',
          accent: '#7859F1',
          'accent-content': '#262601',
          neutral: '#2A323C',
          'neutral-content': '#A6ADBB',
          'base-100': '#1D232A',
          'base-200': '#191E24',
          'base-300': '#15191E',
          'base-content': '#F7E7EF',
          info: '#72B3FF',
          'info-content': '#1D232A',
          success: '#31FAC2',
          'success-content': '#1D232A',
          warning: '#F9CC76',
          'warning-content': '#1D232A',
          error: '#FD5555',
          'error-content': '#1D232A',
          // Radius
          '--rounded-box': '1rem', // border radius rounded-box utility class, used in card and other large boxes
          '--rounded-btn': '0.5rem', // border radius rounded-btn utility class, used in buttons and similar element
          '--rounded-badge': '1.9rem', // border radius rounded-badge utility class, used in badges and similar
          '--tab-radius': '0.5rem', // border radius of tabs
          // Animation
          '--animation-btn': '0.25s', // duration of animation when you click on button
          '--animation-input': '0.2s', // duration of animation for inputs like checkbox, toggle, radio, etc
          '--btn-focus-scale': '0.95', // scale transform of button when you focus on it
          // Borders
          '--border-btn': '1px', // border width of buttons
          '--tab-border': '1px', // border width of tabs
          '--border-focus': '2px', // border width of focus
        }
      },
      'dark',
      'emerald'

    ]
  },
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('tailwindcss-unimportant'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tailwindcss/typography'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('daisyui')
  ],
  darkMode: ['class', '[data-theme="spectre"]']
};
