// I18N
import { premisesNameI18n } from '#lib/indoor/premisesLabels.js'

// MTR system map: https://www.mtr.com.hk/en/customer/services/system_map.html
// Membership is station-specific: linked stations (Central/Hong Kong and TST/East TST)
// keep their own lines. Branch termini and Racecourse retain their actual service line.
export const mtrLines = [
  {
    id: 'TWL',
    color: '#E2231A',
    i18n: premisesNameI18n({ name: 'Tsuen Wan Line', nameZh: '荃灣綫' }),
    stations: 'TSW TWH KWH KWF LAK MEF LCK CSW SSP PRE MOK YMT JOR TST ADM CEN'.split(
      ' ',
    ),
  },
  {
    id: 'KTL',
    color: '#00AF41',
    i18n: premisesNameI18n({ name: 'Kwun Tong Line', nameZh: '觀塘綫' }),
    stations:
      'WHA HOM YMT MOK PRE SKM KOT LOF WTS DIH CHH KOB NTK KWT LAT YAT TIK'.split(' '),
  },
  {
    id: 'ISL',
    color: '#0075C9',
    i18n: premisesNameI18n({ name: 'Island Line', nameZh: '港島綫' }),
    stations:
      'KET HKU SYP SHW CEN ADM WAC CAB TIH FOH NOP QUB TAK SWH SKW HFC CHW'.split(' '),
  },
  {
    id: 'SIL',
    color: '#B5BD00',
    i18n: premisesNameI18n({ name: 'South Island Line', nameZh: '南港島綫' }),
    stations: 'ADM OCP WCH LET SOH'.split(' '),
  },
  {
    id: 'TKL',
    color: '#A35EB5',
    i18n: premisesNameI18n({ name: 'Tseung Kwan O Line', nameZh: '將軍澳綫' }),
    stations: 'NOP QUB YAT TIK TKO HAH POA LHP'.split(' '),
  },
  {
    id: 'TCL',
    color: '#F38B00',
    i18n: premisesNameI18n({ name: 'Tung Chung Line', nameZh: '東涌綫' }),
    stations: 'HOK KOW OLY NAC LAK TSY SUN TUC'.split(' '),
  },
  {
    id: 'AEL',
    color: '#00888A',
    i18n: premisesNameI18n({ name: 'Airport Express', nameZh: '機場快綫' }),
    stations: 'HOK KOW TSY AIR AWE'.split(' '),
  },
  {
    id: 'EAL',
    color: '#53B7E8',
    i18n: premisesNameI18n({ name: 'East Rail Line', nameZh: '東鐵綫' }),
    stations: 'ADM EXC HUH MKK KOT TAW SHT FOT RAC UNI TAP TWO FAN SHS LOW LMC'.split(
      ' ',
    ),
  },
  {
    id: 'TML',
    color: '#9A3820',
    i18n: premisesNameI18n({ name: 'Tuen Ma Line', nameZh: '屯馬綫' }),
    stations:
      'WKS MOS HEO TSH SHM CIO STW CKT TAW HIK DIH KAT SUW TKW HOM HUH ETS AUS NAC MEF TWW KSR YUL LOP TIS SIH TUM'.split(
        ' ',
      ),
  },
  {
    id: 'DRL',
    color: '#E86BA4',
    i18n: premisesNameI18n({ name: 'Disneyland Resort Line', nameZh: '迪士尼綫' }),
    stations: 'SUN DIS'.split(' '),
  },
]

/** Find every service line for a station, in stable network order.
 * @param code Official three-letter station code.
 * @returns Line colors and localized names; unknown stations have no badges.
 */
export function stationLines(code: string): typeof mtrLines {
  return mtrLines.filter(line => line.stations.includes(code.toUpperCase()))
}
