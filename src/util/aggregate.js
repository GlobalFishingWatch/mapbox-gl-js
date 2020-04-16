import { VectorTile } from "@mapbox/vector-tile";
import tilebelt from "@mapbox/tilebelt";
import Pbf from "pbf";

const GEOM_TYPES = {
    BLOB: "blob",
    GRIDDED: "gridded",
    EXTRUDED: "extruded"
};

export const BUFFER_HEADERS = ["cell", "min", "max"];

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

const decodeProto = data => {
    const readField = function(tag, obj, pbf) {
        if (tag === 1) pbf.readPackedVarint(obj.data);
    };
    const read = function(pbf, end) {
        return pbf.readFields(readField, { data: [] }, end);
    };
    const pbfData = new Pbf(data);
    const intArray = read(pbfData);
    return intArray && intArray.data;
};

const getInitialFeature = () => ({
    type: "Feature",
    properties: {
        value: 0,
        info: ""
    },
    geometry: {}
});

export const aggregate = (arrayBuffer, options) => {
    const {
        quantizeOffset,
        tileBBox,
        delta = 30,
        geomType = GEOM_TYPES.GRIDDED,
        singleFrame,
        singleFrameStart = null,
        x, y, z
    } = options;
    // TODO Here assuming that BLOB --> animation frame. Should it be configurable in another way?
    //      Generator could set it by default to BLOB, but it could be overridden by layer params
    // TODO Should be aggregation, not skipping
    const skipOddCells = geomType === GEOM_TYPES.BLOB;

    const features = [];

    let aggregating = [];

    let currentFeatureIndex = 0;
    let currentFeature = getInitialFeature();
    let currentFeatureCell;
    let currentFeatureMinTimestamp;
    let currentFeatureMaxTimestamp;
    let currentFeatureTimestampDelta;
    let currentAggregatedValue = 0;
    let featureBufferPos = 0;
    let head;
    let tail;

    const writeValueToFeature = quantizedTail => {
        // TODO add skipOddCells check
        // console.log(skipOddCells, currentFeatureCell)
        if (skipOddCells === true && currentFeatureCell % 4 !== 0) {
            return;
        }
        if (singleFrameStart === null) {
            currentFeature.properties[
                quantizedTail.toString()
            ] = currentAggregatedValue;
        } else {
            if (singleFrameStart === quantizedTail) {
                currentFeature.properties.value = currentAggregatedValue;
            }
        }
    };

    // write values after tail > minTimestamp
    const writeFinalTail = () => {
        let finalTailValue = 0;
        for (
            let finalTail = tail + 1;
            finalTail <= currentFeatureMaxTimestamp;
            finalTail++
        ) {
            currentAggregatedValue = currentAggregatedValue - finalTailValue;
            if (finalTail > currentFeatureMinTimestamp) {
                finalTailValue = aggregating.shift();
            } else {
                finalTailValue = 0;
            }
            const quantizedTail = finalTail - quantizeOffset;
            if (quantizedTail >= 0) {
                writeValueToFeature(quantizedTail);
            }
        }
    };
    const Int16ArrayBuffer = decodeProto(arrayBuffer);
    const numRows = Int16ArrayBuffer[0]
    const numCols = Int16ArrayBuffer[1]

    for (let i = 2; i < Int16ArrayBuffer.length; i++) {
        const value = Int16ArrayBuffer[i];
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
                // mx
                case 2:
                    currentFeatureMaxTimestamp = value;
                    currentFeatureTimestampDelta =
                        currentFeatureMaxTimestamp - currentFeatureMinTimestamp;
                    break;
                // actual value
                default:
                    // when we are looking at ts 0 and delta is 10, we are in fact looking at the aggregation of day -9
                    tail = head - delta + 1;

                    aggregating.push(value);

                    let tailValue = 0;
                    if (tail > currentFeatureMinTimestamp) {
                        tailValue = aggregating.shift();
                    }
                    currentAggregatedValue =
                        currentAggregatedValue + value - tailValue;

                    const quantizedTail = tail - quantizeOffset;

                    if (currentAggregatedValue > 0 && quantizedTail >= 0) {
                        writeValueToFeature(quantizedTail);
                    }
                    head++;
            }
            featureBufferPos++;

            const isEndOfFeature =
                featureBufferPos - BUFFER_HEADERS.length - 1 ===
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
                featureBufferPos = 0;
                currentAggregatedValue = 0;
                aggregating = [];
                currentFeatureIndex++;
                continue;
            }
        }
    }
    const geoJSON = {
        type: "FeatureCollection",
        features
    };
    return geoJSON;
};

const aggregateIntArray = (intArray, options) => {
    const {
        geomType,
        delta,
        x, y, z,
        quantizeOffset,
        singleFrame,
        singleFrameStart
    } = options;
    const tileBBox = tilebelt.tileToBBOX([x, y, z]);
    const aggregated = aggregate(intArray, {
        x, y, z,
        quantizeOffset,
        tileBBox,
        delta,
        geomType,
        singleFrame,
        singleFrameStart,        // TODO make me configurable
        skipOddCells: false
    });
    return aggregated;
};

export default aggregateIntArray;
