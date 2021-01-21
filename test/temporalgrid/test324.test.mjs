import aggregate from "../../src/util/aggregate.mjs";
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

const agg = aggregate(tile, BASE_CONFIG)
const aggMain = agg.main
const feat = aggMain.features.find(f => f.properties._col === 2 && f.properties._row === 67)
console.log(feat.properties)



export const getCellValues = (rawValues) => {
  // Raw values come as a single string (MVT limitation), turn into an array of ints first
  const values = rawValues.split(',').map((v) => parseInt(v))

  // First two values for a cell are the overall start and end time offsets for all the cell values (in days/hours/10days from start of time)
  const minCellOffset = values[0]
  const maxCellOffset = values[1]

  return { values, minCellOffset, maxCellOffset }
}

export const getRealValues = (rawValues) => {
  // Raw 4w API values come without decimals, multiplied by 100
  const VALUE_MULTIPLIER = 100
  const realValues = rawValues.map((v) => v / VALUE_MULTIPLIER)
  return realValues
}

export const getCellArrayIndex = (minCellOffset, numSublayers, offset) => {
  return 2 + (offset - minCellOffset) * numSublayers
}

export const aggregateCell = (
  rawValues,
  frame,
  delta,
  quantizeOffset,
  numSublayers,
  debug = false
) => {
  const { values, minCellOffset, maxCellOffset } = getCellValues(rawValues)

  // When we should start counting in terms of days/hours/10days from start of time
  const startOffset = quantizeOffset + frame
  const endOffset = startOffset + delta

  if (startOffset > maxCellOffset || endOffset < minCellOffset) return null

  const cellStartOffset = Math.max(startOffset, minCellOffset)
  const cellEndOffset = Math.min(endOffset, maxCellOffset)

  // Where we sould start looking up in the array (minCellOffset, maxCellOffset, sublayer0valueAt0, sublayer1valueAt0, sublayer0valueAt1, sublayer1valueAt1, ...)
  const startAt = getCellArrayIndex(minCellOffset, numSublayers, cellStartOffset)
  const endAt = getCellArrayIndex(minCellOffset, numSublayers, cellEndOffset)

  const rawValuesArrSlice = values.slice(startAt, endAt)

  // One aggregated value per sublayer
  const aggregatedValues = new Array(numSublayers).fill(0)

  for (let i = 0; i < rawValuesArrSlice.length; i++) {
    const sublayerIndex = i % numSublayers
    const rawValue = rawValuesArrSlice[i]
    if (rawValue) {
      aggregatedValues[sublayerIndex] += rawValue
    }
  }
  const realValues = getRealValues(aggregatedValues)
  if (debug) {
    console.log(rawValues, frame, delta, quantizeOffset, numSublayers)
    console.log(values, minCellOffset, maxCellOffset)
    console.log(startOffset, endOffset, cellStartOffset, cellEndOffset, startAt, endAt)
    console.log(realValues)
  }
  return realValues
}

const aggInt = agg.interactive
const feat2 = aggInt.features.find(f => f.properties._col === 2 && f.properties._row === 67)
// console.log(feat2.properties.rawValues)
// console.log(aggregateCell(feat2.properties.rawValues, FRAME, BASE_CONFIG.delta, BASE_CONFIG.quantizeOffset, BASE_CONFIG.numDatasets))

for (let index = 0; index < FRAME; index++) {
  // console.log(index, aggregateCell(feat2.properties.rawValues, index, BASE_CONFIG.delta, BASE_CONFIG.quantizeOffset, BASE_CONFIG.numDatasets))
  
}