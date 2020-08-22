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
        // TODO make me configurable
        skipOddCells = false,
    } = options;
    // TODO Here assuming that BLOB --> animation frame. Should it be configurable in another way?
    //      Generator could set it by default to BLOB, but it could be overridden by layer params
    // TODO Should be aggregation, not skipping
    // const skipOddCells = geomType === GEOM_TYPES.BLOB;

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
        // TODO add skipOddCells check
        // console.log(skipOddCells, currentFeatureCell)
        if (skipOddCells === true && currentFeatureCell % 4 !== 0) {
            return;
        }

        // TODO
        // if (currentAggregatedValue <= 0) {
        //     return
        // }

        let realValue = currentAggregatedValues[0] / VALUE_MULTIPLIER

        if (!breaks) {
            currentFeature.properties[quantizedTail.toString()] = realValue;
            return
        }

        let bucketIndex = 0
        breaks.every((stopValue, i) => {
            bucketIndex = i
            if (realValue <= stopValue) {
                return false
            }
            return true
        })
        
        currentFeature.properties[quantizedTail.toString()] = bucketIndex;
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
                    // if (currentFeatureIndex === 0) {
                    //     console.log('delta:',currentFeatureTimestampDelta)
                    // }
                    break;
                // actual value
                default:
                    // when we are looking at ts 0 and delta is 10, we are in fact looking at the aggregation of day -9
                    tail = head - delta + 1;

                    // const featureBufferValuesPos = featureBufferPos - BUFFER_HEADERS.length - 1
                    
                    // TODO get dataset index
                    const datasetIndex = featureBufferValuesPos % numDatasets
                    // if (currentFeatureIndex === 0) {
                    //     console.log(featureBufferValuesPos)
                    //     console.log(datasetIndex)
                    //     console.log(aggregating)
                    // }

                    // TODO push at correct dataset index
                    aggregating[datasetIndex].push(value);

                    let tailValue = 0;
                    if (tail > currentFeatureMinTimestamp) {
                        // TODO get aggregating at correct dataset index
                        tailValue = aggregating[datasetIndex].shift();
                    }

                    // TODO currentAggregatedValue*S*
                    currentAggregatedValues[datasetIndex] =
                        currentAggregatedValues[datasetIndex] + value - tailValue;

                    const quantizedTail = tail - quantizeOffset;

                    if (quantizedTail >= 0) {
                        writeValueToFeature(quantizedTail);
                    }

                    // TODO *only if* last of datasets for frame
                    if (datasetIndex === numDatasets - 1) {
                        head++;
                    }

                    featureBufferValuesPos++
            }
            featureBufferPos++;

            // TODO take num datasets into account
            console.log(featureBufferPos, currentFeatureTimestampDelta)
            const isEndOfFeature =
                (featureBufferPos - BUFFER_HEADERS.length - 1) / numDatasets ===
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
