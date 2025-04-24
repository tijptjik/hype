import plugin from 'tailwindcss/plugin';
import colors from 'tailwindcss/colors';

export default {
  content: ['./src/**/*.{html,svelte,js,ts}'],
  theme: {
    fontFamily: {
      sans: ['Geologica', 'sans-serif'],
      hant: ['Noto Sans HK', 'sans-serif'],
      hans: ['Noto Sans SC', 'sans-serif'],
      admin: ['Geologica', 'sans-serif'],
      serif: ['Merriweather', 'serif'],
      mono: ['IBM Plex Mono', 'monospace']
    },
    colors: {
      ...colors,
      'map-primary': '#cb37c1',
      'map-base': '#4987e2',
      'base-50': '#556172'
    },
    extend: {
      borderStyle: ['hover'],
      transitionDuration: {
        1500: '1500ms',
        2000: '2000ms'
      },
      transitionDelay: {
        1500: '1500ms',
        2000: '2000ms'
      },
      screens: {
        '3xl': '1800px',
        '4xl': '2400px',
        'h-200': { raw: '(min-height: 800px)' },
        'h-250': { raw: '(min-height: 1000px)' },
        'w-64': { raw: '(min-width: 256px)' },
        'w-80': { raw: '(min-width: 320px)' },
        'w-84': { raw: '(min-width: 336px)' },
        'w-88': { raw: '(min-width: 352px)' },
        'w-92': { raw: '(min-width: 368px)' },
        'w-96': { raw: '(min-width: 384px)' },
        'w-100': { raw: '(min-width: 400px)' },
        'w-104': { raw: '(min-width: 416px)' },
        'w-108': { raw: '(min-width: 432px)' },
        'w-112': { raw: '(min-width: 448px)' },
        'w-116': { raw: '(min-width: 464px)' },
        'w-120': { raw: '(min-width: 480px)' },
        'w-128': { raw: '(min-width: 512px)' },
        'w-160': { raw: '(min-width: 640px)' },
        'w-192': { raw: '(min-width: 768px)' },
        'w-256': { raw: '(min-width: 1024px)' },
        'w-320': { raw: '(min-width: 1280px)' },
        'w-384': { raw: '(min-width: 1536px)' },
        'w-512': { raw: '(min-width: 2048px)' },
        'w-640': { raw: '(min-width: 2560px)' },
        'w-768': { raw: '(min-width: 3072px)' }
      },
      borderWidth: {
        1: '1px',
        3: '3px'
      },
      colors: {
        'gradient-end': 'hsl(var(--fuchsia-800))', // color-variable
        'gradient-start': 'hsl(var(--rose-500))', // color-variable
        secondary: '#7482FF' // color-variable
      },
      fontSize: {
        '2xs': '0.625rem',
        '3xs': '0.55rem'
      },
      height: {
        0.25: '0.0625rem',
        17.5: '4.375rem'
      },
      width: {
        17.5: '4.375rem'
      },
      minHeight: {
        200: '50rem', // 800px
        250: '62.5rem' // 1000px
      },
      minWidth: {
        200: '50rem', // 800px
        250: '62.5rem' // 1000px
      },
      flexBasis: {
        '1/3-gap-6': 'calc(33.3% - 1rem)',
        '1/2-gap-6': 'calc(50% - 1rem)',
        '1/1': '100%'
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
          'base-50': '#3f4752',
          'base-100': '#1D232A',
          'base-200': '#191E24',
          'base-300': '#15191E',
          'base-content': '#F7E7EF',
          info: '#72B3FF',
          'info-content': '#1D232A',
          success: '#31FAC2',
          'success-content': '#1D232A',
          warning: 'rgb(223, 69, 69)',
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
          '--border-focus': '2px' // border width of focus
        }
      },
      'dark',
      'emerald'
    ]
  },
  plugins: [
    require('tailwindcss-unimportant'),
    require('@tailwindcss/container-queries'),
    require('@tailwindcss/typography'),
    require('daisyui'),
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.drag-none': {
          '-webkit-user-drag': 'none',
          '-khtml-user-drag': 'none',
          '-moz-user-drag': 'none',
          '-o-user-drag': 'none',
          'user-drag': 'none'
        }
      });
    })
  ],
  darkMode: ['class', '[data-theme="spectre"]']
};
