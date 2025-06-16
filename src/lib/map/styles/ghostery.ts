import type { AddLayerObject } from 'maplibre-gl';

export const ghosteryEarth: AddLayerObject = {
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
};

export const ghosteryRoads: AddLayerObject = {
  id: 'roads',
  source: 'hongkong-latest',
  'source-layer': 'roads',
  type: 'line',
  filter: ['in', 'kind', 'highway', 'major_road', 'minor_road'],
  paint: { 
    'line-color': '#4987E2',
    'line-width': [
      'case',
      ['==', ['get', 'kind'], 'highway'], 1.5,
      ['==', ['get', 'kind'], 'major_road'], 1.5,
      1.2
    ]
  }
};

export const ghosteryBuildings: AddLayerObject = {
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
};

export const ghosteryAddressLabel: AddLayerObject = {
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
};

export const ghosteryPlacesLocality: AddLayerObject = {
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
};

export const ghosteryPlacesSubplace: AddLayerObject = {
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
};

export const ghosteryRoadsLabelsMinor: AddLayerObject = {
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
};
