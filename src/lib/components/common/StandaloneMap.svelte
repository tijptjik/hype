<script lang="ts">
// import { AttributionControl, GeolocateControl, Map, NavigationControl, ScaleControl } from 'maplibre-gl';
// SVELTE
import { page } from '$app/stores';
import { onMount } from 'svelte';
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
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// STYLES
import '$lib/styles/map.css';
// MAPLIBRE
import { monkeyPatchMapLibre } from '$lib/map/maplibre-preload';
import { Point } from 'maplibre-gl';
// CONFIG
import { MOBILE_MAX_WIDTH } from '$lib/index';
// TYPES
import type { PointLike, LatLng } from 'maplibre-gl';
// let mapStore: MapStore = getContext(MAPSTORE_CONTEXT_KEY);
let mapContainer: HTMLDivElement;

// GLOBAL
let maplibre: any;
let session = $page.data.session;

// CONTEXT
const mapContext = getMapContext();
const omniContext = getOmniContext();

let lastHorizontalOffset = $state(0);
// WATCHERS
// Watch for changes in features
onMount(async () => {
  // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they are heavy
  // and the max worker size in the free tier is 1 MB
  await loadScript('https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js');
  // @ts-ignore
  globalThis.maplibregl = maplibregl;

  maplibre = monkeyPatchMapLibre();

  mapContext.map = new maplibre.Map({
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
    attributionControl: false
  });

  mapContext.map!.on('load', () => {
    mapContext.map!.addSource('hongkong-latest', {
      type: 'vector',
      url: 'https://tiles.hype.hk/basemap/hongkong-latest.json'
    });

    console.log(session?.user?.experimental);

    if (!session?.user?.experimental.noLabelsMode) {
      mapContext.map!.addLayer({
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

    mapContext.map!.addLayer({
      id: 'hk-roads',
      source: 'hongkong-latest',
      'source-layer': 'roads',
      type: 'line',
      filter: ['in', 'kind', 'major_road', 'minor_road'],
      paint: { 'line-color': '#4987E2' }
    });

    if (!session?.user?.experimental.noLabelsMode) {
      mapContext.map!.addLayer({
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

      mapContext.map!.addLayer({
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

      mapContext.map!.addLayer({
        id: 'roads_labels_minor',
        type: 'symbol',
        source: 'hongkong-latest',
        'source-layer': 'roads',
        minzoom: 16,
        filter: ['in', 'kind', 'minor_road', 'other', 'path'],
        layout: {
          'symbol-sort-key': ['get', 'min_zoom'],
          'symbol-placement': 'line',
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
          'symbol-spacing': 250,
          'symbol-avoid-edges': true
        },
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': '#4987E2',
          'text-halo-width': 1,
          'text-translate-anchor': 'map'
        }
      });
    }

    if ($page.data.session) {
      // Initial marker setup
      updateMarkers(mapContext, mapContext.getVisibleFeatures(), maplibre);
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

      mapContext.map!.addControl(geolocateControl, 'bottom-right');

      // TODO : Reactivate
      // setTimeout(() => {
      //   geolocateControl._geolocateButton.click();
      // }, 200);

      navigator.geolocation.watchPosition(
        (geoLocation) => {
          mapContext.state.userLocation = geoLocation;
        },
        (error) => {
          // TODO: Add a fallback to the default location
          // console.error('Error getting geolocation:', error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: Infinity }
      );
    }
  });

  mapContext.map!.on('click', (e) => {
    e.originalEvent.preventDefault();
    e.originalEvent.stopPropagation();
    const target = e.originalEvent.target as HTMLElement;
    if (target.dataset.type === 'marker') {
      const featureId = target.dataset.featureId;
      if (!featureId) return;
      omniContext.handleFeatureSelection(mapContext, featureId, { openCard: true });
    } else if (Object.values(mapContext.state.panels).some((panel) => panel)) {
      mapContext.closeAllPanels();
    } else {
      omniContext.close();
    }
  });

  // mapContext.map!.addControl(new NavigationControl({}), 'bottom-right');
  // mapContext.map!.addControl(new ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left');
  // mapContext.map!.addControl(new AttributionControl({ compact: true }), 'bottom-right');
});

$effect(() => {
  // Rerender the map when the features change
  mapContext.features;
  updateMarkers(mapContext, mapContext.getVisibleFeatures(), maplibre);
});

// STATE : DERIVED
let horizontalOffset = $derived(() => {
  const { filters, maps, stars, settings } = mapContext.state.panels;
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
  if (horizontalOffset() !== lastHorizontalOffset) {
    if (mapContext.map) {
      let coordinates = mapContext.map!.getCenter();
      const centerInPx: Point = mapContext.map!.project(coordinates);
      const newPoint: PointLike = new Point(
        centerInPx.x +
          (horizontalOffset() === 0 ? lastHorizontalOffset : -horizontalOffset()),
        centerInPx.y
      );
      const newCenter: LatLng = mapContext.map!.unproject(newPoint);
      mapContext.map!.easeTo({ center: newCenter });
    } else {
      console.error('mapContext.map is not defined');
    }
    lastHorizontalOffset = horizontalOffset();
  }
});
</script>

<div
  id="map"
  class="map absolute inset-0 overflow-hidden rounded-2xl"
  data-testid="map"
  bind:this={mapContainer}>
  {#if $page.data.session && !mapContext.state.prisms.layer.length && !mapContext.state.panels.maps}
    <div
      class="pointer-events-none absolute inset-0 z-50 mx-auto flex cursor-pointer items-center justify-center bg-black/70 text-center caret-transparent"
      in:fade={{ duration: 800, delay: 3000, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      onclick={() => (mapContext.state.panels.maps = true)}>
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
