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
const getAt = (intArray, configOverrides, featureIndex, timeIndex, expect) => {
  const agg = aggregateWith(
    intArray,
    configOverrides
  )
  const at = agg.features[featureIndex].properties[timeIndex]
  return at
  tap.equal(
    at, 
    expect
  )
}

tap.equal(getAt([1,1,0,15340,15340,42], {}, 0, 0), 1)
tap.equal(getAt([1,1,0,15341,15341,42], {}, 0, 0), 1)
tap.equal(getAt([1,1,0,15341,15341,142], {}, 0, 0), 2)
tap.equal(getAt([1,1,0,15341,15341,999999], {}, 0, 0), 6)
tap.equal(getAt([1,1,0,15341,15341,0], {}, 0, 0), 0)
tap.equal(getAt([1,1,0,15341,15341,42], { breaks: undefined }, 0, 0), .42)

tap.equal(getAt([1,1,0,15341,15341,42,456789], { numDatasets: 2, breaks: undefined }, 0, 0), .42)
tap.equal(getAt([100,100,0,15341,15341,42,1234,1,15341,15341,43,456789], { numDatasets: 2, breaks: undefined }, 1, 0), .43)