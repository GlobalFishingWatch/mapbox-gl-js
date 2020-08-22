import aggregate from "./aggregate.mjs";
import tap from 'tap'

const BASE_CONFIG = {
  breaks: [0, 1, 5, 10, 15, 30],
  delta: 30,
  geomType: "gridded",
  interval: "day",
  numDatasets: 1,
  quantizeOffset: 15340,
  singleFrame: false,
  tileBBox: [-22.5, -21.943045533438177, 0, 0],
  x: 7,
  y: 8,
  z: 4
}

const aggregateWith = (intArray, configOverrides) => aggregate(intArray, { ...BASE_CONFIG, ...configOverrides })
const getAt = (agg, featureIndex, timeIndex) => agg.features[featureIndex].properties[timeIndex]

const test = (intArray, configOverrides, featureIndex, timeIndex, expect) => {
  const agg = aggregateWith(
    intArray,
    configOverrides
  )
  console.log( agg.features)
  const at = getAt(
    agg,
    featureIndex,
    timeIndex
  )
  tap.equal(
    at, 
    expect
  )
}

// test([1,1,0,15341,15341,42], {}, 0, 0, 1)
// test([1,1,0,15341,15341,142], {}, 0, 0, 2)
// test([1,1,0,15341,15341,42], { breaks: undefined }, 0, 0, .42)

// test([1,1,0,15341,15341,42,456789], { numDatasets: 2, breaks: undefined }, 0, 0, .42)
test([100,100,0,15341,15341,42,456789,1,15341,15341,43,456789], { numDatasets: 2, breaks: undefined }, 1, 0, .42)