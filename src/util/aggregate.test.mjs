import aggregate from "./aggregate.mjs";
import tap from 'tap'

const BASE_CONFIG = {
  breaks: [[0, 1, 5, 10, 15, 30]],
  delta: 1,
  geomType: 'gridded',
  interval: 'day',
  combinationMode: 'add',
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
}

//                                   0         5          10        15
const aggTest = [1,1, 0,15340,15355,42,2,1,0,0,12,0,0,0,0,3,2,1,0,0,123]
tap.equal(getAt(aggTest, { breaks: undefined, delta: 1 }, 0, 0), 0.42)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 5 }, 0, 0), 0.45)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 5 }, 0, 1), 0.15)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 5 }, 0, 10), 0.06)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 6 }, 0, 10), 1.29)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 7 }, 0, 10), undefined) // since we dont compute trail anymore


// bucket stuff
tap.equal(getAt([1,1, 0,15340,15341,42,0], {}, 0, 0), 1)
tap.equal(getAt([1,1, 0,15340,15341,142, 0], {}, 0, 0), 2)
tap.equal(getAt([1,1, 0, 15340,15341,999999, 0], {}, 0, 0), 6)
tap.equal(getAt([1,1, 0,15340,15341,0,0], {}, 0, 0), undefined)
tap.equal(getAt([1,1, 0,15340,15341,42,0], { breaks: undefined }, 0, 0), .42)

tap.equal(getAt([1,1, 0,15340,15341,42,43,0,0], { numDatasets: 2, breaks: undefined }, 0, 0), .85)
tap.equal(getAt([1,2, 0,15340,15341,42,43,0,0, 1,15340,15341,52,53,0,0], { numDatasets: 2, breaks: undefined }, 1, 0), 1.05)
tap.equal(getAt([1,1, 0,15340,15341,42,43,0,0], { numDatasets: 2, combinationMode: 'compare', breaks: undefined }, 0, 0), '1;0.43')
tap.equal(getAt([1,1, 0,15340,15341,52,53,0,0], { numDatasets: 2, combinationMode: 'add' }, 0, 0), 2)
tap.equal(getAt([1,1, 0,15340,15341,52,253,0,0], { numDatasets: 2, combinationMode: 'compare', breaks: [[0, 1, 5, 10, 15, 30], [0, 1, 2, 10, 15, 30]] }, 0, 0), 10 + 3)

//bivariate
//
//  y: datasetB
//   ^  
//   |  +---+---+---+---+
//   |  |und| 1 | 2 | 3 |
//   |  +---+---+---+---+
//      | 4 | 5 | 6 | 7 |
//      +---+---+---+---+
//      | 8 | 9 | 10| 11|
//      +---+---+---+---+
//      | 12| 13| 14| 15|
//      +---+---+---+---+
//          ---> x: datasetA
//
tap.equal(getAt([1,1, 0,15340,15341,42,987,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: undefined  }, 0, 0), '0.42;9.87')
tap.equal(getAt([1, 1, 0,15340,15341,0,0,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: [[0, 1, 5], [0, 1, 5]] }, 0, 0), undefined)
tap.equal(getAt([1, 1, 0,15340,15341,9999,0,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: [[0, 1, 5], [0, 1, 5]] }, 0, 0), 3)
tap.equal(getAt([1, 1, 0,15340,15341,0,9999,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: [[0, 1, 5], [0, 1, 5]] }, 0, 0), 12)
tap.equal(getAt([1, 1, 0,15340,15341,9999,9999,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: [[0, 1, 5], [0, 1, 5]] }, 0, 0), 15)
tap.equal(getAt([1, 1, 0,15340,15341,42,42,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: [[0, 1, 5], [0, 1, 5]] }, 0, 0), 5)
