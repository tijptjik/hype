<script lang="ts">
// import { AttributionControl, GeolocateControl, Map, NavigationControl, ScaleControl } from 'maplibre-gl';
// SVELTE
import { onMount, tick } from 'svelte';
// ICONS
import { Square3Stack3d } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// ANIMATION
import { fade } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
// I18N
import { m } from '$lib/i18n';
// LIB
import { loadScript } from '$lib';
import { updateMarkers } from '$lib/map/markers';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// STYLES
import '$lib/styles/map.css';
// MAPLIBRE
import { monkeyPatchMapLibre } from '$lib/map/maplibre-preload';
import { Point } from 'maplibre-gl';
// CONFIG
import { MOBILE_MAX_WIDTH } from '$lib/index';
// TYPES
import type { PointLike, LngLatLike } from 'maplibre-gl';
// let mapStore: MapStore = getContext(MAPSTORE_CONTEXT_KEY);
let mapContainer: HTMLDivElement;

// GLOBAL
let maplibre: any;
// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniContext();

let lastHorizontalOffset = $state(0);
let isAnimating = $state(false);
// WATCHERS
// Watch for changes in features
onMount(async () => {
  // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they are heavy
  // and the max worker size in the free tier is 1 MB
  await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');
  // @ts-ignore
  globalThis.maplibregl = maplibregl;

  maplibre = monkeyPatchMapLibre();

  // Wait for the DOM element to be available
  if (!mapContainer) {
    console.error('Map container not available');
    return;
  }

  appCtx.map = new maplibre.Map({
    container: mapContainer,
    style: {
      version: 8,
      sources: {},
      layers: [],
      sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
      glyphs:
        'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'
    },
    center: [114.17276, 22.29191],
    bearing: 17.6,
    zoom: 14,
    hash: false,
    pitch: 45,
    attributionControl: false
  });

  // appCtx.map.transform.setFov(0);

  appCtx.map!.on('load', () => {
    appCtx.map!.addSource('hongkong-latest', {
      type: 'vector',
      url: 'https://tiles.hype.hk/basemap/hongkong-latest.json'
    });

    if (!appCtx.user?.experimental?.noLabelsMode) {
      appCtx.map!.addLayer({
        id: 'earth',
        type: 'fill',
        source: 'hongkong-latest',
        'source-layer': 'earth',
        filter: ['==', '$type', 'Polygon'],
        layout: { visibility: 'visible' },
        paint: {
          'fill-outline-color': 'rgb(66, 66, 66)',
          'fill-antialias': true
        }
      });
    }

    appCtx.map!.addLayer({
      id: 'roads',
      source: 'hongkong-latest',
      'source-layer': 'roads',
      type: 'line',
      filter: ['in', 'kind', 'major_road', 'minor_road'],
      paint: { 'line-color': '#4987E2' }
    });

    appCtx.map!.addLayer({
      id: 'buildings',
      source: 'hongkong-latest',
      'source-layer': 'buildings',
      type: 'fill',
      filter: ['in', 'kind', 'building', 'building_part'],
      paint: {
        'fill-color': 'rgba(15, 14, 14, 1)',
        'fill-opacity': 0.5,
        'fill-outline-color': [
          'interpolate',
          ['linear'],
          ['zoom'],
          17,
          'rgba(13, 13, 13, 1)',
          20,
          'rgba(240, 77, 127, 0.66)'
        ]
      }
    });

    appCtx.map!.addLayer({
      id: 'address_label',
      type: 'symbol',
      source: 'hongkong-latest',
      'source-layer': 'buildings',
      minzoom: 19,
      filter: ['==', 'kind', 'address'],
      layout: {
        'symbol-placement': 'point',
        'text-font': ['Noto Sans Italic'],
        'text-field': ['get', 'addr_housenumber'],
        'text-size': 12
      },
      paint: {
        'text-color': 'rgba(240, 77, 127, 0.86)',
        'text-halo-color': '#141414',
        'text-halo-width': 1,
        'text-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          18.5,
          0,
          20,
          1
        ]
      }
    });

    if (!appCtx.user?.experimental?.noLabelsMode) {
      appCtx.map!.addLayer({
        id: 'places_locality',
        type: 'symbol',
        source: 'hongkong-latest',
        'source-layer': 'places',
        filter: ['==', 'kind', 'locality'],
        layout: {
          'icon-image': ['step', ['zoom'], 'townspot', 8, ''],
          'icon-size': 0.7,
          'text-field': [
            'case',
            [
              'all',
              ['any', ['has', 'name'], ['has', 'pgf:name']],
              ['!', ['any', ['has', 'name2'], ['has', 'pgf:name2']]],
              ['!', ['any', ['has', 'name3'], ['has', 'pgf:name3']]]
            ],
            [
              'case',
              ['has', 'script'],
              [
                'case',
                [
                  'any',
                  ['is-supported-script', ['get', 'name']],
                  ['has', 'pgf:name']
                ],
                [
                  'format',
                  ['coalesce', ['get', 'name:en'], ['get', 'name:en']],
                  {},
                  '\n',
                  {},
                  [
                    'case',
                    [
                      'all',
                      ['!', ['has', 'name:en']],
                      ['has', 'name:en'],
                      ['!', ['has', 'script']]
                    ],
                    '',
                    ['coalesce', ['get', 'pgf:name'], ['get', 'name']]
                  ],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                ['get', 'name:en']
              ],
              [
                'format',
                [
                  'coalesce',
                  ['get', 'name:en'],
                  ['get', 'pgf:name'],
                  ['get', 'name']
                ],
                {}
              ]
            ],
            [
              'all',
              ['any', ['has', 'name'], ['has', 'pgf:name']],
              ['any', ['has', 'name2'], ['has', 'pgf:name2']],
              ['!', ['any', ['has', 'name3'], ['has', 'pgf:name3']]]
            ],
            [
              'case',
              ['all', ['has', 'script'], ['has', 'script2']],
              [
                'format',
                ['get', 'name:en'],
                {},
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script2'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                }
              ],
              [
                'case',
                ['has', 'script2'],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name'],
                    ['get', 'name']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name2'],
                    ['get', 'name2']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ]
              ]
            ],
            [
              'case',
              ['all', ['has', 'script'], ['has', 'script2'], ['has', 'script3']],
              [
                'format',
                ['get', 'name:en'],
                {},
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script2'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script3'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                }
              ],
              [
                'case',
                ['!', ['has', 'script']],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name'],
                    ['get', 'name']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script3'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                ['!', ['has', 'script2']],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name2'],
                    ['get', 'name2']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script3'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name3'],
                    ['get', 'name3']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ]
              ]
            ]
          ],
          'text-font': [
            'case',
            ['<=', ['get', 'min_zoom'], 5],
            ['literal', ['Noto Sans Medium']],
            ['literal', ['Noto Sans Regular']]
          ],
          'symbol-sort-key': [
            'case',
            ['has', 'sort_key'],
            ['get', 'sort_key'],
            ['get', 'min_zoom']
          ],
          'text-padding': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            3,
            8,
            7,
            12,
            11
          ],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            2,
            [
              'case',
              ['<', ['get', 'population_rank'], 13],
              8,
              ['>=', ['get', 'population_rank'], 13],
              13,
              0
            ],
            4,
            [
              'case',
              ['<', ['get', 'population_rank'], 13],
              10,
              ['>=', ['get', 'population_rank'], 13],
              15,
              0
            ],
            6,
            [
              'case',
              ['<', ['get', 'population_rank'], 12],
              11,
              ['>=', ['get', 'population_rank'], 12],
              17,
              0
            ],
            8,
            [
              'case',
              ['<', ['get', 'population_rank'], 11],
              11,
              ['>=', ['get', 'population_rank'], 11],
              18,
              0
            ],
            10,
            [
              'case',
              ['<', ['get', 'population_rank'], 9],
              12,
              ['>=', ['get', 'population_rank'], 9],
              20,
              0
            ],
            15,
            [
              'case',
              ['<', ['get', 'population_rank'], 8],
              12,
              ['>=', ['get', 'population_rank'], 8],
              22,
              0
            ]
          ],
          'icon-padding': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0,
            0,
            8,
            4,
            10,
            8,
            12,
            6,
            22,
            2
          ],
          'text-justify': 'auto',
          'text-variable-anchor': [
            'step',
            ['zoom'],
            ['literal', ['bottom', 'left', 'right', 'top']],
            8,
            ['literal', ['center']]
          ],
          'text-radial-offset': 0.3
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#4987E2',
          'text-halo-width': 1
        }
      });

      appCtx.map!.addLayer({
        id: 'places_subplace',
        type: 'symbol',
        source: 'hongkong-latest',
        'source-layer': 'places',
        filter: ['==', 'kind', 'neighbourhood'],
        layout: {
          'symbol-sort-key': [
            'case',
            ['has', 'sort_key'],
            ['get', 'sort_key'],
            ['get', 'min_zoom']
          ],
          'text-field': [
            'case',
            [
              'all',
              ['any', ['has', 'name'], ['has', 'pgf:name']],
              ['!', ['any', ['has', 'name2'], ['has', 'pgf:name2']]],
              ['!', ['any', ['has', 'name3'], ['has', 'pgf:name3']]]
            ],
            [
              'case',
              ['has', 'script'],
              [
                'case',
                [
                  'any',
                  ['is-supported-script', ['get', 'name']],
                  ['has', 'pgf:name']
                ],
                [
                  'format',
                  ['coalesce', ['get', 'name:en'], ['get', 'name:en']],
                  {},
                  '\n',
                  {},
                  [
                    'case',
                    [
                      'all',
                      ['!', ['has', 'name:en']],
                      ['has', 'name:en'],
                      ['!', ['has', 'script']]
                    ],
                    '',
                    ['coalesce', ['get', 'pgf:name'], ['get', 'name']]
                  ],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                ['get', 'name:en']
              ],
              [
                'format',
                [
                  'coalesce',
                  ['get', 'name:en'],
                  ['get', 'pgf:name'],
                  ['get', 'name']
                ],
                {}
              ]
            ],
            [
              'all',
              ['any', ['has', 'name'], ['has', 'pgf:name']],
              ['any', ['has', 'name2'], ['has', 'pgf:name2']],
              ['!', ['any', ['has', 'name3'], ['has', 'pgf:name3']]]
            ],
            [
              'case',
              ['all', ['has', 'script'], ['has', 'script2']],
              [
                'format',
                ['get', 'name:en'],
                {},
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script2'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                }
              ],
              [
                'case',
                ['has', 'script2'],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name'],
                    ['get', 'name']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name2'],
                    ['get', 'name2']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ]
              ]
            ],
            [
              'case',
              ['all', ['has', 'script'], ['has', 'script2'], ['has', 'script3']],
              [
                'format',
                ['get', 'name:en'],
                {},
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script2'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script3'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                }
              ],
              [
                'case',
                ['!', ['has', 'script']],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name'],
                    ['get', 'name']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script3'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                ['!', ['has', 'script2']],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name2'],
                    ['get', 'name2']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script3'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name3'],
                    ['get', 'name3']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ]
              ]
            ]
          ],
          'text-font': ['Noto Sans Regular'],
          'text-max-width': 7,
          'text-letter-spacing': 0.1,
          'text-padding': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            2,
            8,
            4,
            12,
            18,
            15,
            20
          ],
          'text-size': [
            'interpolate',
            ['exponential', 1.2],
            ['zoom'],
            11,
            8,
            14,
            14,
            18,
            24
          ],
          'text-transform': 'uppercase',
          'icon-keep-upright': false
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#4987E2',
          'text-halo-width': 1
        }
      });

      appCtx.map!.addLayer({
        id: 'roads_labels_minor',
        type: 'symbol',
        source: 'hongkong-latest',
        'source-layer': 'roads',
        minzoom: 16,
        filter: ['in', 'kind', 'minor_road', 'other', 'path'],
        layout: {
          'symbol-sort-key': ['get', 'min_zoom'],
          'symbol-placement': 'line',
          'symbol-spacing': 1000,
          'text-font': ['Noto Sans Regular'],
          'text-field': [
            'case',
            [
              'all',
              ['any', ['has', 'name'], ['has', 'pgf:name']],
              ['!', ['any', ['has', 'name2'], ['has', 'pgf:name2']]],
              ['!', ['any', ['has', 'name3'], ['has', 'pgf:name3']]]
            ],
            [
              'case',
              ['has', 'script'],
              [
                'case',
                [
                  'any',
                  ['is-supported-script', ['get', 'name']],
                  ['has', 'pgf:name']
                ],
                [
                  'format',
                  ['coalesce', ['get', 'name:en'], ['get', 'name:en']],
                  {},
                  '\n',
                  {},
                  [
                    'case',
                    [
                      'all',
                      ['!', ['has', 'name:en']],
                      ['has', 'name:en'],
                      ['!', ['has', 'script']]
                    ],
                    '',
                    ['coalesce', ['get', 'pgf:name'], ['get', 'name']]
                  ],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                ['get', 'name:en']
              ],
              [
                'format',
                [
                  'coalesce',
                  ['get', 'name:en'],
                  ['get', 'pgf:name'],
                  ['get', 'name']
                ],
                {}
              ]
            ],
            [
              'all',
              ['any', ['has', 'name'], ['has', 'pgf:name']],
              ['any', ['has', 'name2'], ['has', 'pgf:name2']],
              ['!', ['any', ['has', 'name3'], ['has', 'pgf:name3']]]
            ],
            [
              'case',
              ['all', ['has', 'script'], ['has', 'script2']],
              [
                'format',
                ['get', 'name:en'],
                {},
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script2'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                }
              ],
              [
                'case',
                ['has', 'script2'],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name'],
                    ['get', 'name']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name2'],
                    ['get', 'name2']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ]
              ]
            ],
            [
              'case',
              ['all', ['has', 'script'], ['has', 'script2'], ['has', 'script3']],
              [
                'format',
                ['get', 'name:en'],
                {},
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script2'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                },
                '\n',
                {},
                ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                {
                  'text-font': [
                    'case',
                    ['==', ['get', 'script3'], 'Devanagari'],
                    ['literal', ['Noto Sans Devanagari Regular v1']],
                    ['literal', ['Noto Sans Regular']]
                  ]
                }
              ],
              [
                'case',
                ['!', ['has', 'script']],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name'],
                    ['get', 'name']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script3'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                ['!', ['has', 'script2']],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name2'],
                    ['get', 'name2']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name3'], ['get', 'name3']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script3'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ],
                [
                  'format',
                  [
                    'coalesce',
                    ['get', 'name:en'],
                    ['get', 'pgf:name3'],
                    ['get', 'name3']
                  ],
                  {},
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name'], ['get', 'name']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  },
                  '\n',
                  {},
                  ['coalesce', ['get', 'pgf:name2'], ['get', 'name2']],
                  {
                    'text-font': [
                      'case',
                      ['==', ['get', 'script2'], 'Devanagari'],
                      ['literal', ['Noto Sans Devanagari Regular v1']],
                      ['literal', ['Noto Sans Regular']]
                    ]
                  }
                ]
              ]
            ]
          ],
          'text-size': 12,
          'text-anchor': 'center',
          'text-justify': 'center',
          'text-rotation-alignment': 'map',
          'text-allow-overlap': false,
          'symbol-avoid-edges': true
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.9)',
          'text-halo-color': 'rgb(73, 135, 226, 0.6)',
          'text-halo-width': 1,
          'text-translate-anchor': 'map'
        }
      });
    }

    if (appCtx.user) {
      // Initial marker setup
      updateMarkers(appCtx, appCtx.getVisibleFeatures(), maplibre);
      // TODO: Add a cleanup function to remove the markers when the component unmounts

      // Initialize and store the GeolocateControl
      const geolocateControl = new maplibre.GeolocateControl({
        positionOptions: {
          timeout: 5000,
          enableHighAccuracy: true,
          maximumAge: Infinity
        },
        trackUserLocation: true
      });

      // HACK: This is a hack to prevent the geolocate control from updating the camera
      geolocateControl._updateCamera = () => {};

      appCtx.map!.addControl(geolocateControl, 'bottom-right');

      // TODO : Reactivate
      // setTimeout(() => {
      //   geolocateControl._geolocateButton.click();
      // }, 200);

      navigator.geolocation.watchPosition(
        (geoLocation) => {
          appCtx.state.userLocation = geoLocation;
        },
        (error) => {
          // TODO: Add a fallback to the default location
          // console.error('Error getting geolocation:', error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: Infinity }
      );
    }
  });

  appCtx.map!.on('click', (e) => {
    e.originalEvent.preventDefault();
    e.originalEvent.stopPropagation();
    const target = e.originalEvent.target as HTMLElement;
    if (target.dataset.type === 'marker') {
      const featureId = target.dataset.featureId;
      if (!featureId) return;
      omniCtx.handleFeatureSelection(appCtx, featureId, { openCard: true });
    } else {
      // Priority 1: Close feature card if open
      if (omniCtx.state.isCardOpen) {
        omniCtx.close();
      }
      // Priority 2: Close panels if open
      else if (Object.values(appCtx.state.panels).some((panel) => panel)) {
        appCtx.closeAllPanels();
      }
    }
  });

  // appCtx.map!.addControl(new NavigationControl({}), 'bottom-right');
  // appCtx.map!.addControl(new ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left');
  // appCtx.map!.addControl(new AttributionControl({ compact: true }), 'bottom-right');
});

$effect(() => {
  // Rerender the map when the features change
  if (!isAnimating) {
    appCtx.features;
    updateMarkers(appCtx, appCtx.getVisibleFeatures(), maplibre);
  }
});

// STATE : DERIVED
let horizontalOffset = $derived(() => {
  const { filters, maps, stars, settings } = appCtx.state.panels;
  const leftPanelOpen = maps || stars;
  const rightPanelOpen = filters || settings;
  if (window.innerWidth < MOBILE_MAX_WIDTH) {
    return 0;
  }
  return leftPanelOpen && rightPanelOpen
    ? 0
    : leftPanelOpen
      ? 420 / 2
      : rightPanelOpen
        ? -420 / 2
        : 0;
});

// Ensure that the center of the map is in the center of the viewport,
// even after a panel is triggered.
$effect(() => {
  if (horizontalOffset() !== lastHorizontalOffset && appCtx.map && !isAnimating) {
    isAnimating = true;
    let coordinates = appCtx.map!.getCenter();
    const centerInPx: Point = appCtx.map!.project(coordinates);
    const newPoint: PointLike = new Point(
      centerInPx.x +
        (horizontalOffset() === 0 ? lastHorizontalOffset : -horizontalOffset()),
      centerInPx.y
    );
    const newCenter: LngLatLike = appCtx.map!.unproject(newPoint);

    lastHorizontalOffset = horizontalOffset();

    // Set up one-time event listener for when animation completes
    const onMoveEnd = () => {
      isAnimating = false;
      appCtx.map?.off('moveend', onMoveEnd);
    };
    appCtx.map!.on('moveend', onMoveEnd);

    // Start the animation
    appCtx.map!.easeTo({
      center: newCenter,
      duration: 300
    });

    // Fallback timeout in case moveend doesn't fire
    setTimeout(() => {
      isAnimating = false;
      appCtx.map?.off('moveend', onMoveEnd);
    }, 500);
  }
});
</script>

<div
  id="map"
  class="map absolute inset-0 overflow-hidden rounded-2xl caret-transparent"
  data-testid="map"
  bind:this={mapContainer}>
  {#if appCtx.user && !appCtx.state.prisms.layer.length && !appCtx.state.panels.maps}
    <div
      class="pointer-events-none absolute inset-0 z-50 mx-auto flex cursor-pointer items-center justify-center bg-black/70 text-center caret-transparent"
      in:fade={{ duration: 800, delay: 3000, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      onclick={() => (appCtx.state.panels.maps = true)}>
      <div
        class="group pointer-events-auto flex max-w-xs flex-col items-center gap-8 rounded-lg border-2 border-[#4987E2] bg-black p-8 px-8 font-mono shadow-[0_0_15px_rgba(0,0,255,0.5)]">
        <p class="text-lg text-base-content">{m.map__no_markers_without_layers()}</p>
        <button
          class="group-hover:inset-shadow-lg btn btn-outline border-[#4987E2] bg-black font-bold uppercase text-[#4987E2] ring-primary transition-all duration-300 group-hover:border-primary/70 group-hover:text-primary/70 group-hover:shadow-primary/70 group-hover:ring-2">
          <Icon
            src={Square3Stack3d}
            class="transition-all duration-300 group-hover:scale-125 group-hover:text-primary" />
          {m.map__select_layer()}
        </button>
      </div>
    </div>
  {/if}
</div>
