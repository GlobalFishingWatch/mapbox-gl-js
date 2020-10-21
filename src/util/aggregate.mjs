export const BUFFER_HEADERS = ["cell", "min", "max"];

// Values from the 4wings API in intArray form can't be floats, so they are multiplied by a factor, here we get back to the original value
const VALUE_MULTIPLIER = 100

const getLastDigit = (num) => parseInt(num.toString().slice(-1))
// In order for setFeatureState to work correctly, generate unique IDs across viewport-visible tiles:
// concatenate last x/z digits and cell increment index (goal is to get numbers as small as possible)
const generateUniqueId = (x, y, cellId) => parseInt([getLastDigit(x), getLastDigit(y), cellId].join(''))

const getCellCoords = (tileBBox, cell, numCols) => {
    const col = cell % numCols;
    const row = Math.floor(cell / numCols);
    const [minX, minY, maxX, maxY] = tileBBox;
    const width = maxX - minX;
    const height = maxY - minY;
    return {
        col,
        row,
        width,
        height
    };
};

const getPointFeature = (tileBBox, cell, numCols, numRows) => {
    const [minX, minY] = tileBBox;
    const { col, row, width, height } = getCellCoords(tileBBox, cell, numCols);

    const pointMinX = minX + (col / numCols) * width;
    let pointMinY = minY + (row / numRows) * height;

    return {
        type: "Feature",
        properties: {
            _col: col,
            _row: row,
        },
        geometry: {
            type: "Point",
            coordinates: [pointMinX, pointMinY]
        }
    }
};

const getRectangleFeature = (tileBBox, cell, numCols, numRows) => {
    const [minX, minY] = tileBBox;
    const { col, row, width, height } = getCellCoords(tileBBox, cell, numCols);

    const squareMinX = minX + (col / numCols) * width;
    const squareMinY = minY + (row / numRows) * height;
    const squareMaxX = minX + ((col + 1) / numCols) * width;
    const squareMaxY = minY + ((row + 1) / numRows) * height;
    return {
        type: "Feature",
        properties: {
            _col: col,
            _row: row,
        },
        geometry: {
            type: "Polygon",
            coordinates: [
                [
                    [squareMinX, squareMinY],
                    [squareMaxX, squareMinY],
                    [squareMaxX, squareMaxY],
                    [squareMinX, squareMaxY],
                    [squareMinX, squareMinY]
                ]
            ]
        }
    };
};

const getFeature = (geomType, tileBBox, cell, numCols, numRows) => {
    return (geomType === 'point')
        ? getPointFeature(tileBBox, cell, numCols, numRows)
        : getRectangleFeature(tileBBox, cell, numCols, numRows)
};

// Given breaks [[0, 10, 20, 30], [-15, -5, 0, 5, 15]]:
//                                    |   |   |   |   |
//                                    |   |   |   |   |
//  if first dataset selected     [   0, 10, 20, 30  ]
//    index returned is:            0 | 1 | 2 | 3 | 4 |
//                                    |   |   |   |   |
//  if 2nd dataset selected       [ -15, -5,  0,  5, 15]
//    index returned is:            0 | 1 | 2 | 3 | 4 | 5
//                                    |   |   |   |   |
// Note: 0 is a special value, feature is entirely omitted
//                                            |
//                                       undefined
const getBucketIndex = (breaks, value) => {
    let currentBucketIndex
    for (let bucketIndex = 0; bucketIndex < breaks.length + 1; bucketIndex++) {
        const stopValue = (breaks[bucketIndex] !== undefined) ? breaks[bucketIndex] : Number.POSITIVE_INFINITY;
        if (value <= stopValue) {
            currentBucketIndex = bucketIndex
            break
        }
    }
    if (currentBucketIndex === undefined) {
        currentBucketIndex = breaks.length
    }
    return currentBucketIndex
}

const getAddValue = (realValuesSum, breaks) => {
    if (realValuesSum === 0) return undefined
    return (breaks) ? getBucketIndex(breaks[0], realValuesSum) : realValuesSum
}

const getCompareValue = (datasetsHighestRealValue, datasetsHighestRealValueIndex, breaks) => {
    if (datasetsHighestRealValue === 0) return undefined
    if (breaks) {
        // offset each dataset by 10 + add actual bucket value
        return datasetsHighestRealValueIndex * 10 + getBucketIndex(breaks[datasetsHighestRealValueIndex], datasetsHighestRealValue)
    } else {
        // only useful for debug
        return `${datasetsHighestRealValueIndex};${datasetsHighestRealValue}`
    }
}

const getBivariateValue = (realValues, breaks) => {
    if (realValues[0] === 0 && realValues[1] === 0) return undefined
    if (breaks) {
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
        const valueA = getBucketIndex(breaks[0], realValues[0])
        const valueB = getBucketIndex(breaks[1], realValues[1])
        const index = valueB * (breaks[0].length + 1)  + valueA
        return index

    } else {
        // only useful for debug
        return `${realValues[0]};${realValues[1]}`
    }
}

const getLiteralValues = (realValues, numDatasets) => {
    if (numDatasets === 1) return realValues
    return `[${realValues.join(',')}]`
}

const getCumulativeValue = (realValuesSum, cumulativeValuesPaddedStrings) => {
    if (realValuesSum === 0) return undefined
    return cumulativeValuesPaddedStrings.join('')
}


const aggregate = (intArray, options) => {
    const {
        quantizeOffset = 0,
        tileBBox,
        delta = 30,
        geomType = 'rectangle',
        singleFrame,
        breaks,
        x, y, z,
        numDatasets,
        combinationMode,
    } = options;

    if (breaks && breaks.length !== numDatasets && (combinationMode === 'compare' || combinationMode === 'bivariate')) {
        throw new Error('must provide as many breaks arrays as number of datasets when using compare and bivariate modes')
    }
    if (breaks && breaks.length !== 1 && combinationMode === 'add') {
        throw new Error('add combinationMode requires one and only one breaks array')
    }
    if (combinationMode === 'bivariate') {
        if (numDatasets !== 2) throw new Error('bivariate combinationMode requires exactly two datasets')
        if (breaks) {
            if (breaks.length !== 2) throw new Error('bivariate combinationMode requires exactly two breaks array')
            if (breaks[0].length !== breaks[1].length) throw new Error('bivariate breaks arrays must have the same length')
            // TODO This might change if we want bivariate with more or less than 16 classes
            if (breaks[0].length !== 3 || breaks[1].length !== 3 ) throw new Error('each bivariate breaks array require exactly 3 values')
        }
    }

    const features = [];

    let aggregating = Array(numDatasets).fill([]);
    let currentAggregatedValues = Array(numDatasets).fill(0);

    let currentFeatureIndex = 0;
    let currentFeature;
    let currentFeatureCell;
    let currentFeatureMinTimestamp;
    let currentFeatureMaxTimestamp;
    let currentFeatureTimestampDelta;
    let featureBufferPos = 0;
    let featureBufferValuesPos = 0;
    let head;
    let tail;

    let datasetsHighestRealValue = Number.NEGATIVE_INFINITY
    let datasetsHighestRealValueIndex
    let realValuesSum = 0
    let cumulativeValuesPaddedStrings = []

    const writeValueToFeature = (quantizedTail, valueToWrite) => {
        const propertiesKey = quantizedTail.toString()
        currentFeature.properties[propertiesKey] = valueToWrite
    }

    const numRows = intArray[0]
    const numCols = intArray[1]

    // const t = performance.now()
    // console.log(x, y, z, intArray)

    for (let i = 2; i < intArray.length; i++) {
        const value = intArray[i];
        if (singleFrame) {
            // singleFrame means cell, value, cell, value in the intArray response
            if (i % 2 === 0) {
                currentFeatureCell = value;
            } else {
                const realValue = value / VALUE_MULTIPLIER
                currentFeature = getFeature(
                    geomType,
                    tileBBox,
                    currentFeatureCell,
                    numCols,
                    numRows
                )
                const uniqueId = generateUniqueId(x, y, currentFeatureCell)
                currentFeature.id = uniqueId
                currentFeature.properties.value = realValue
                currentFeature.properties._cell = currentFeatureCell
                features.push(currentFeature);
                currentAggregatedValues = Array(numDatasets).fill(0);
            }
        } else {
            switch (featureBufferPos) {
                // cell
                case 0:
                    currentFeatureCell = value;
                    currentFeature = getFeature(
                        geomType,
                        tileBBox,
                        currentFeatureCell,
                        numCols,
                        numRows
                    )
                    break;
                // minTs
                case 1:
                    currentFeatureMinTimestamp = value;
                    head = currentFeatureMinTimestamp;
                    break;
                // maxTs
                case 2:
                    currentFeatureMaxTimestamp = value;
                    currentFeatureTimestampDelta =
                        currentFeatureMaxTimestamp - currentFeatureMinTimestamp;
                    break;
                // actual value
                default:
                    // when we are looking at ts 0 and delta is 10, we are in fact looking at the aggregation of day -9
                    tail = head - delta + 1;

                    // gets index of dataset, knowing that after headers values go
                    // dataset1, dataset2, dataset1, dataset2, ...
                    const datasetIndex = featureBufferValuesPos % numDatasets

                    // Get real value
                    const realValue = value / VALUE_MULTIPLIER

                    // collect value for this dataset
                    aggregating[datasetIndex].push(realValue);

                    let tailValue = 0;
                    if (tail > currentFeatureMinTimestamp) {
                        tailValue = aggregating[datasetIndex].shift();
                    }

                    // collect "working" value, ie value at head by substracting tail value
                    const realValueAtFrameForDataset = currentAggregatedValues[datasetIndex] + realValue - tailValue;
                    currentAggregatedValues[datasetIndex] = realValueAtFrameForDataset

                    // Compute mode-specific values
                    if (combinationMode === 'compare') {
                        if (realValueAtFrameForDataset > datasetsHighestRealValue) {
                            datasetsHighestRealValue = realValueAtFrameForDataset
                            datasetsHighestRealValueIndex = datasetIndex
                        }
                    }
                    if (combinationMode === 'add' || combinationMode === 'cumulative') {
                        realValuesSum += realValueAtFrameForDataset
                    }
                     if (combinationMode === 'cumulative') {
                        const cumulativeValuePaddedString = Math.round(realValuesSum).toString().padStart(4, '0')
                        cumulativeValuesPaddedStrings.push(cumulativeValuePaddedString)
                    }

                    const quantizedTail = tail - quantizeOffset;

                    if (quantizedTail >= 0 && datasetIndex === numDatasets - 1) {
                        let finalValue
                        // TODO add 'single' mode
                        if (combinationMode === 'compare') {
                            finalValue = getCompareValue(datasetsHighestRealValue, datasetsHighestRealValueIndex, breaks)
                        }
                        else if (combinationMode === 'add') {
                            finalValue = getAddValue(realValuesSum, breaks)
                        }
                        else if (combinationMode === 'bivariate') {
                            finalValue = getBivariateValue(currentAggregatedValues, breaks)
                        }
                        else if (combinationMode === 'literal') {
                            finalValue = getLiteralValues(currentAggregatedValues, numDatasets)
                        }
                        else if (combinationMode === 'cumulative') {
                            finalValue = getCumulativeValue(realValuesSum, cumulativeValuesPaddedStrings)
                        }
                        writeValueToFeature(quantizedTail, finalValue);
                    }

                    if (datasetIndex === numDatasets - 1) {
                        // When all dataset values have been collected for this frame, we can move to next frame
                        head++;

                        // Reset mode-specific values when last dataset
                        datasetsHighestRealValue = Number.NEGATIVE_INFINITY
                        realValuesSum = 0
                        cumulativeValuesPaddedStrings = []
                    }

                    featureBufferValuesPos++
            }
            featureBufferPos++;

            const isEndOfFeature =
                ((featureBufferPos - BUFFER_HEADERS.length) / numDatasets) - 1 ===
                currentFeatureTimestampDelta;

            if (isEndOfFeature) {
                const uniqueId = generateUniqueId(x, y, currentFeatureIndex)
                currentFeature.id = uniqueId
                currentFeature.properties._cell = currentFeatureCell

                features.push(currentFeature);

                currentFeatureTimestampDelta = 0
                featureBufferPos = 0;
                featureBufferValuesPos = 0;

                datasetsHighestRealValue = Number.NEGATIVE_INFINITY
                realValuesSum = 0
                cumulativeValuesPaddedStrings = []

                aggregating = Array(numDatasets).fill([]);
                currentAggregatedValues = Array(numDatasets).fill(0);

                currentFeatureIndex++;
                continue;
            }
        }
    }
    // console.log(performance.now()- t)

    const geoJSON = {
        type: "FeatureCollection",
        features
    };
    return geoJSON;
};

export default aggregate;
