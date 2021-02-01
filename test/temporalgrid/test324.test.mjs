import { aggregateTile, aggregateCell } from '@globalfishingwatch/fourwings-aggregate';
import tap from 'tap'
import tile from './test324.mjs'

const FRAME = 302
const BASE_CONFIG = {
  breaks: [[0,16331,65326,97989,163315,326630,489944,816574]],
  delta: 95,
  geomType: 'gridded',
  interval: 'day',
  combinationMode: 'compare',
  numDatasets: 1,
  quantizeOffset: 17532,
  singleFrame: false,
  tileBBox: [-22.5, -21.943045533438177, 0, 0],
  x: 3,
  y: 2,
  z: 4,
  visible: [true],
  interactive: true
}

const agg = aggregateTile(tile, BASE_CONFIG)
const aggMain = agg.main
const feat = aggMain.features.find(f => f.properties._col === 2 && f.properties._row === 67)
console.log(feat.properties)

const aggInt = agg.interactive
const feat2 = aggInt.features.find(f => f.properties._col === 2 && f.properties._row === 67)
// console.log(feat2.properties.rawValues)
// console.log(aggregateCell(feat2.properties.rawValues, FRAME, BASE_CONFIG.delta, BASE_CONFIG.quantizeOffset, BASE_CONFIG.numDatasets))

for (let index = 0; index < FRAME; index++) {
  // console.log(index, aggregateCell(feat2.properties.rawValues, index, BASE_CONFIG.delta, BASE_CONFIG.quantizeOffset, BASE_CONFIG.numDatasets))
  
}