const GEOM_TYPES = {
    BLOB: "blob",
    GRIDDED: "gridded",
    EXTRUDED: "extruded"
};

export const BUFFER_HEADERS = ["cell", "min", "max"];

// Values from the 4wings API in intArray form can't be floats, so they are multiplied by a factor, here we get back to the original value
const VALUE_MULTIPLIER = 100

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

const getPointGeom = (tileBBox, cell, numCols, numRows) => {
    const [minX, minY] = tileBBox;
    const { col, row, width, height } = getCellCoords(tileBBox, cell, numCols);

    const pointMinX = minX + (col / numCols) * width;
    let pointMinY = minY + (row / numRows) * height;
    // if (row === 0) {
    //     pointMinY += 0.1
    // }

    return {
        type: "Point",
        coordinates: [pointMinX, pointMinY]
    };
};

const getSquareGeom = (tileBBox, cell, numCols, numRows) => {
    const [minX, minY] = tileBBox;
    const { col, row, width, height } = getCellCoords(tileBBox, cell, numCols);

    const squareMinX = minX + (col / numCols) * width;
    const squareMinY = minY + (row / numRows) * height;
    const squareMaxX = minX + ((col + 1) / numCols) * width;
    const squareMaxY = minY + ((row + 1) / numRows) * height;
    return {
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
    };
};

const getInitialFeature = () => ({
    type: "Feature",
    properties: {
        value: 0,
        info: ""
    },
    geometry: {}
});

// Given breaks [[0, 10, 20, 30], [0, 10, 20, 30]]
// If first dataset selected:
// -0.1 -> 0
// 0 -> undefined
// 0.1 -> 1
// 15 -> 2
// 25 -> 3
// 35 -> 4
// If second dataset selected:
// -0.1 -> 10
// 0 -> undefined
// 0.1 -> 11
// 15 -> 12
// 25 -> 13
// 35 -> 14

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

const aggregate = (intArray, options) => {
    const {
        quantizeOffset = 0,
        tileBBox,
        delta = 30,
        geomType = GEOM_TYPES.GRIDDED,
        singleFrame,
        breaks,
        x, y, z,
        numDatasets,
        combinationMode,
    } = options;

    if (breaks && breaks.length !== numDatasets && combinationMode !== 'add') {
        throw new Error('must provide as many breaks arrays as number of datasets when using compare and bivariate modes')
    }
    if (breaks && breaks.length !== 1 && combinationMode === 'add') {
        throw new Error('add combinationMode requires one and only one breaks array')
    }

    const features = [];

    let aggregating = Array(numDatasets).fill([]);
    let currentAggregatedValues = Array(numDatasets).fill(0);

    let currentFeatureIndex = 0;
    let currentFeature = getInitialFeature();
    let currentFeatureCell;
    let currentFeatureMinTimestamp;
    let currentFeatureMaxTimestamp;
    let currentFeatureTimestampDelta;
    let featureBufferPos = 0;
    let featureBufferValuesPos = 0;
    let head;
    let tail;

    const writeValueToFeature = quantizedTail => {
        const propertiesKey = quantizedTail.toString()
        if (numDatasets === 1) {
            const singleValue = currentAggregatedValues[0]
            if (singleValue <= 0) {
                return
            }
            let realValue = singleValue / VALUE_MULTIPLIER
            let finalValue = (breaks) ? getBucketIndex(breaks[0], realValue) : realValue
            currentFeature.properties[propertiesKey] = finalValue;
        } else {
            if (currentAggregatedValues.every(v => v === 0)) {
                return
            }
            const realValues = currentAggregatedValues.map(v => v / VALUE_MULTIPLIER)
            let finalValue
            if (combinationMode === 'add') {
                const combinedValue = realValues.reduce((prev, current) => prev + current, 0)
                finalValue = (breaks) ? getBucketIndex(breaks[0], combinedValue) : combinedValue
            } else if (combinationMode === 'compare') {
                let biggestValue = Number.NEGATIVE_INFINITY
                let biggestAtDatasetIndex
                realValues.forEach((value, datasetIndex) => {
                    if (value > biggestValue) {
                        biggestValue = value
                        biggestAtDatasetIndex = datasetIndex
                    }
                })
                if (breaks) {
                    // offset each dataset by 10 + add actual bucket value
                    finalValue = biggestAtDatasetIndex * 10 + getBucketIndex(breaks[biggestAtDatasetIndex], biggestValue)
                } else {
                    // only useful for debug
                    finalValue = `${biggestAtDatasetIndex},${biggestValue}`
                }
            }

            currentFeature.properties[propertiesKey] = finalValue
        }


    };

    // write values after tail > minTimestamp
    const writeFinalTail = () => {
        for (let datasetIndex = 0; datasetIndex < numDatasets; datasetIndex++) {
            let finalTailValue = 0;
            for (
                let finalTail = tail + 1;
                finalTail <= currentFeatureMaxTimestamp;
                finalTail++
            ) {
                currentAggregatedValues[datasetIndex] = currentAggregatedValues[datasetIndex] - finalTailValue;
                if (finalTail > currentFeatureMinTimestamp) {
                    finalTailValue = aggregating[datasetIndex].shift();
                } else {
                    finalTailValue = 0;
                }
                const quantizedTail = finalTail - quantizeOffset;
                if (quantizedTail >= 0) {
                    writeValueToFeature(quantizedTail);
                }
            }
        }
    };
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
                if (geomType === GEOM_TYPES.BLOB) {
                    currentFeature.geometry = getPointGeom(
                        tileBBox,
                        currentFeatureCell,
                        numCols,
                        numRows
                    );
                } else {
                    currentFeature.geometry = getSquareGeom(
                        tileBBox,
                        currentFeatureCell,
                        numCols,
                        numRows
                    );
                }
                currentFeature.properties.value = value
                currentFeature.properties.info = Object.values(
                    currentFeature.properties
                )
                    .map(v => `${v}`)
                    .join(",");
                currentFeature.properties.id = currentFeatureCell
                features.push(currentFeature);
                currentFeature = getInitialFeature();
                currentAggregatedValue = 0;
            }
        } else {
            switch (featureBufferPos) {
                // cell
                case 0:
                    currentFeatureCell = value;
                    if (geomType === GEOM_TYPES.BLOB) {
                        currentFeature.geometry = getPointGeom(
                            tileBBox,
                            currentFeatureCell,
                            numCols,
                            numRows
                        );
                    } else {
                        currentFeature.geometry = getSquareGeom(
                            tileBBox,
                            currentFeatureCell,
                            numCols,
                            numRows
                        );
                    }
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

                    // collect value for this dataset
                    aggregating[datasetIndex].push(value);

                    let tailValue = 0;
                    if (tail > currentFeatureMinTimestamp) {
                        tailValue = aggregating[datasetIndex].shift();
                    }

                    // collect "working" value, ie value at head by substracting tail value
                    currentAggregatedValues[datasetIndex] =
                        currentAggregatedValues[datasetIndex] + value - tailValue;

                    const quantizedTail = tail - quantizeOffset;

                    if (quantizedTail >= 0) {
                        // TODO Move below so that write is not called for every dataset?
                        writeValueToFeature(quantizedTail);
                    }

                    // When all dataset values have been collected for this frame, we can move to next frame
                    if (datasetIndex === numDatasets - 1) {
                        head++;
                    }

                    featureBufferValuesPos++
            }
            featureBufferPos++;

            const isEndOfFeature =
                ((featureBufferPos - BUFFER_HEADERS.length) / numDatasets) - 1 ===
                currentFeatureTimestampDelta;

            if (isEndOfFeature) {
                writeFinalTail();
                currentFeature.properties.info = Object.values(
                    currentFeature.properties
                )
                    .map(v => `${v}`)
                    .join(",");
                // currentFeature.properties.id = `${z}_${x}_${y}__${currentFeatureCell}`
                currentFeature.properties.id = currentFeatureCell
                features.push(currentFeature);
                currentFeature = getInitialFeature();

                currentFeatureTimestampDelta = 0
                featureBufferPos = 0;
                featureBufferValuesPos = 0;

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
