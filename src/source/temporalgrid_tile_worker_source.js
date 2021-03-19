import Protobuf from "pbf";
import vtpbf from "vt-pbf";
import geojsonVt from "geojson-vt";
import MultiSourceLayerGeoJSONWrapper from "./multi_source_geojson_wrapper";
import VectorTileWorkerSource from "./vector_tile_worker_source";
import { getArrayBuffer } from "../util/ajax";
import { extend } from "../util/util";
import { aggregateTile } from '@globalfishingwatch/fourwings-aggregate';
import tilebelt from "@mapbox/tilebelt";

const getAggregationParams = params => {
    const url = new URL(params.request.url);
    const { x, y, z } = params.tileID.canonical;

    const quantizeOffset = parseInt(
        url.searchParams.get("quantizeOffset") || "0"
    );
    const singleFrame = url.searchParams.get("singleFrame") === "true";
    const interactive = url.searchParams.get("interactive") === "true";
    const aggregationParams =  {
        x, y, z,
        singleFrame,
        interactive,
        quantizeOffset,
        geomType: url.searchParams.get("geomType") || "point",
        delta: parseInt(url.searchParams.get("delta") || "10"),
    };
    aggregationParams.sublayerCount = parseInt(url.searchParams.get("sublayerCount")) || 1

    if (url.searchParams.get("interval")) {
        aggregationParams.interval = url.searchParams.get("interval")
    }
    if (url.searchParams.get("aggregationOperation")) {
        aggregationParams.aggregationOperation = url.searchParams.get("aggregationOperation")
    }
    if (url.searchParams.get("sublayerCombinationMode")) {
        aggregationParams.sublayerCombinationMode = url.searchParams.get("sublayerCombinationMode")
    }
    if (url.searchParams.get("sublayerBreaks")) {
        aggregationParams.sublayerBreaks = JSON.parse(url.searchParams.get("sublayerBreaks"))
    }
    if (url.searchParams.get("sublayerVisibility")) {
        aggregationParams.sublayerVisibility = JSON.parse(url.searchParams.get('sublayerVisibility'))
    } else {
        aggregationParams.sublayerVisibility = (new Array(aggregationParams.numDatasets)).fill(true)
    }
    return aggregationParams
};

const getFinalurl = (originalUrlString, { singleFrame, interval }) => {
    const originalUrl = new URL(originalUrlString);

    const finalUrl = new URL(originalUrl.origin + originalUrl.pathname)

    // We want proxy active as default when api tiles auth is required
    const proxy = originalUrl.searchParams.get("proxy") !== "false";
    finalUrl.searchParams.append('proxy', proxy);
    finalUrl.searchParams.append('format', 'intArray');
    finalUrl.searchParams.append('temporal-aggregation', singleFrame);

    if (interval) {
        finalUrl.searchParams.append('interval', interval);
    }
    const dateRange = originalUrl.searchParams.get("date-range")
    if (dateRange) {
        finalUrl.searchParams.append('date-range', decodeURI(dateRange))
    }

    let finalUrlStr = finalUrl.toString()
    const datasets = originalUrl.searchParams.get("datasets")
    if (datasets) {
        finalUrlStr = `${finalUrlStr}&${datasets}`
    }
    const filters = originalUrl.searchParams.get("filters")
    if (filters) {
        finalUrlStr = `${finalUrlStr}&${filters}`
    }

    return decodeURI(finalUrlStr);
};

const geoJSONtoVectorTile = (geoJSON, options) => {
    const { x, y, z } = options;
    const tileindex = geojsonVt(geoJSON);
    const newTile = tileindex.getTile(z, x, y);
    return newTile
}

const decodeProto = data => {
    const readField = function(tag, obj, pbf) {
        if (tag === 1) pbf.readPackedVarint(obj.data);
    };
    const read = function(pbf, end) {
        return pbf.readFields(readField, { data: [] }, end);
    };
    const pbfData = new Protobuf(data);
    const intArray = read(pbfData);
    return intArray && intArray.data;
};

const getTile = (data, options) => {
    const {x, y, z} = options;
    const tileBBox = tilebelt.tileToBBOX([x, y, z]);
    const int16ArrayBuffer = decodeProto(data);
    const aggregated = aggregateTile(int16ArrayBuffer, { ...options, tileBBox });
    console.log(aggregated.main)
    const mainTile = geoJSONtoVectorTile(aggregated.main, options)
    const sourceLayers = {
        temporalgrid: mainTile
    }
    if (options.interactive === true) {
        const interactiveTile = geoJSONtoVectorTile(aggregated.interactive, options)
        sourceLayers.temporalgrid_interactive = interactiveTile
    }
    const geojsonWrapper = new MultiSourceLayerGeoJSONWrapper(sourceLayers, {
        extent: 4096
    });

    let pbf = vtpbf.fromGeojsonVt(sourceLayers)

    if (
        pbf.byteOffset !== 0 ||
        pbf.byteLength !== pbf.buffer.byteLength
    ) {
        // Compatibility with node Buffer (https://github.com/mapbox/pbf/issues/35)
        pbf = new Uint8Array(pbf);
    }

    return {
        vectorTile: geojsonWrapper,
        rawData: pbf.buffer,
    }
}

const loadVectorData = (params, callback) => {
    const aggregationParams = getAggregationParams(params);
    // console.log(aggregationParams)
    const url = getFinalurl(params.request.url, aggregationParams);
    // console.log(url)
    const requestParams = Object.assign({}, params.request, { url });
    const request = getArrayBuffer(
        requestParams,
        (err, data, cacheControl, expires) => {
            if (err) {
                callback(err);
            } else if (data) {
                const tile = getTile(data, aggregationParams)
                callback(null, {
                    ...tile,
                    cacheControl,
                    expires
                });
            }
        }
    );
    return () => {
        request.cancel();
        callback();
    };
};

class TemporalGridTileWorkerSource extends VectorTileWorkerSource {
    constructor(actor, layerIndex, availableImages) {
        super(actor, layerIndex, availableImages, loadVectorData);
    }
}

export default TemporalGridTileWorkerSource;
