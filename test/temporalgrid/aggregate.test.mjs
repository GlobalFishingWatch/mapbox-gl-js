import aggregate from "../../src/util/aggregate.mjs";
import tap from 'tap'
import bigtile from './bigtile.mjs'
import { performance } from 'perf_hooks';

const BASE_CONFIG = {
  breaks: [[0, 100, 500, 1000, 1500, 3000]],
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
  z: 4,
  visible: [true, true, true]
}

const aggregateWith = (intArray, configOverrides) => aggregate(intArray, { ...BASE_CONFIG, ...configOverrides }).main
const getAt = (intArray, configOverrides, featureIndex, timeIndex, expect) => {
  const agg = aggregateWith(
    intArray,
    configOverrides
  )
  const at = agg.features[featureIndex].properties[timeIndex]
  return at
}

// aggregation per se
//                                   0         5          10        15
const aggTest = [1,1, 0,15340,15355,4200,200,100,0,0,1200,0,0,0,0,300,200,100,0,0,12300]
tap.equal(getAt(aggTest, { breaks: undefined, delta: 1 }, 0, 0), 4200)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 5 }, 0, 0), 4500)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 5 }, 0, 1), 1500)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 5 }, 0, 10), 600)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 6 }, 0, 10), 12900)
tap.equal(getAt(aggTest, { breaks: undefined, delta: 7 }, 0, 10), undefined) // since we dont compute trail anymore


// bucket stuff
tap.equal(getAt([1,1, 0,15340,15341,42,0], {}, 0, 0), 1)
tap.equal(getAt([1,1, 0,15340,15341,142, 0], {}, 0, 0), 2)
tap.equal(getAt([1,1, 0, 15340,15341,2999, 0], {}, 0, 0), 5)
tap.equal(getAt([1,1, 0, 15340,15341,3001, 0], {}, 0, 0), 6)
tap.equal(getAt([1,1, 0, 15340,15341,999999, 0], {}, 0, 0), 6)
tap.equal(getAt([1,1, 0,15340,15341,0,0], {}, 0, 0), undefined)
tap.equal(getAt([1,1, 0,15340,15341,42,0], { breaks: undefined }, 0, 0), 42)

tap.equal(getAt([1,1, 0,15340,15341,42,43,0,0], { numDatasets: 2, breaks: undefined }, 0, 0), 85)
tap.equal(getAt([1,2, 0,15340,15341,42,43,0,0, 1,15340,15341,52,53,0,0], { numDatasets: 2, breaks: undefined }, 1, 0), 105) // test with 2 features
tap.equal(getAt([1,1, 0,15340,15341,42,43,0,0], { numDatasets: 2, combinationMode: 'compare', breaks: undefined }, 0, 0), '1;43')
tap.equal(getAt([1,1, 0,15340,15341,52,53,0,0], { numDatasets: 2 }, 0, 0), 2)
tap.equal(getAt([1,1, 0,15340,15341,253,52,0,0], { numDatasets: 2, combinationMode: 'compare', breaks: [[0, 100, 200, 1000, 1500, 3000], [0, 100, 200, 1000, 1500, 3000]] }, 0, 0), 3)
tap.equal(getAt([1,1, 0,15340,15341,52,253,0,0], { numDatasets: 2, combinationMode: 'compare', breaks: [[0, 100, 200, 1000, 1500, 3000], [0, 100, 200, 1000, 1500, 3000]] }, 0, 0), 10 + 3)

//bivariate
//  y: datasetB
//     
//   |    0 | 0
//   |   --(u)--+---+---+---+
//   |    0 | 1 | 2 | 3 | 4 |
//   |      +---+---+---+---+
//   v      | 5 | 6 | 7 | 8 |
//          +---+---+---+---+
//          | 9 | 10| 11| 12|
//          +---+---+---+---+
//          | 13| 14| 15| 16|
//          +---+---+---+---+
//          --------------> x: datasetA
//
const bivBreaks = [[0, 100, 500, 1000], [0, 100, 500, 1000]]
tap.equal(getAt([1,1, 0,15340,15341,42,987,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: undefined  }, 0, 0), '42;987')
tap.equal(getAt([1, 1, 0,15340,15341,0,0,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: bivBreaks }, 0, 0), undefined)
tap.equal(getAt([1,1, 0,15340,15341,99,1001,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: bivBreaks  }, 0, 0), 13)
tap.equal(getAt([1,1, 0,15340,15341,101,1001,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: bivBreaks  }, 0, 0), 14)
tap.equal(getAt([1, 1, 0,15340,15341,1001,0,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: bivBreaks }, 0, 0), 4)
tap.equal(getAt([1, 1, 0,15340,15341,9999,9999,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: bivBreaks }, 0, 0), 16)
tap.equal(getAt([1, 1, 0,15340,15341,99,99,0,0], { numDatasets: 2, combinationMode: 'bivariate', breaks: bivBreaks }, 0, 0), 1)


// cumulative                                                                                                       AAAAAABBBBBBCCCCCC
tap.equal(getAt([1,1, 0,15340,15341,100,200,300,0,0,0], { numDatasets: 3, combinationMode: 'cumulative'  }, 0, 0), '000100000300000600')
//                                                                                                                                  AAAAAABBBBBBCCCCCC
tap.equal(getAt([1,1, 0,15340,15341,100,200,300,400,500,600], { numDatasets: 3, combinationMode: 'cumulative', delta: 2  }, 0, 0), '000500001200002100')


//  Visibility
const visibilityConfig = { numDatasets: 2, breaks: undefined, visible: [false, true] }
tap.equal(getAt([1,1, 0,15340,15341,4300,4200,0,0], visibilityConfig, 0, 0), 4200)
tap.equal(getAt([1,1, 0,15340,15341,4300,4200,0,0], { ...visibilityConfig, combinationMode: 'compare' }, 0, 0), '1;4200')
tap.equal(getAt([1,1, 0,15340,15341,4300,4200,0,0], { ...visibilityConfig, combinationMode: 'bivariate' }, 0, 0), '0;4200')
tap.equal(getAt([1,1, 0,15340,15342,4300,4200,4300,4200,0,0], { ...visibilityConfig, combinationMode: 'compare', delta: 2 }, 0, 0), '1;8400')


// perf test
let sum = 0
for (var i = 0; i< 20; i++) {
  const t = performance.now()
  const geojson = aggregate(bigtile,
    {
      "x":7,
      "y":5,
      "z":4,
      "singleFrame":false,
      "quantizeOffset":15340,
      "geomType":"rectangle",
      "delta":31,
      "numDatasets":2,
      "interval":"day",
      "breaks":[[0,31,186,310,930],[0,31,186,310,930]],
      // "breaks":[[0,31,186],[0,31,186]],
      // "breaks":[[0,31,186,310,930]],
      // "combinationMode":"compare",
      "combinationMode":"compare",
      "tileBBox":[-22.5,40.97989806962013,0,55.77657301866769],
      interactive: true,
      visible: [true, true, true]
  })
  const delta = performance.now() - t
  console.log(delta)
  sum += delta
}

console.log('avg:', sum / 20)
