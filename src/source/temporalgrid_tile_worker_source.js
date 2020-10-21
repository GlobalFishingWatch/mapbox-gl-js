import Protobuf from "pbf";
import vtpbf from "vt-pbf";
import geojsonVt from "geojson-vt";
import GeoJSONWrapper from "./geojson_wrapper";
import VectorTileWorkerSource from "./vector_tile_worker_source";
import { getArrayBuffer } from "../util/ajax";
import { extend } from "../util/util";
import aggregate from "../util/aggregate.mjs";
import tilebelt from "@mapbox/tilebelt";


const isoToDate = iso => {
    return new Date(iso).getTime();
};

const isoToDay = iso => {
    return isoToDate(iso) / 1000 / 60 / 60 / 24;
};

const getAggregationParams = params => {
    const url = new URL(params.request.url);
    const { x, y, z } = params.tileID.canonical;

    const quantizeOffset = parseInt(
        url.searchParams.get("quantizeOffset") || "0"
    );
    const singleFrame = url.searchParams.get("singleFrame") === "true";
    const aggregationParams =  {
        x, y, z,
        singleFrame,
        quantizeOffset,
        geomType: url.searchParams.get("geomType") || "point",
        delta: parseInt(url.searchParams.get("delta") || "10"),
    };
    aggregationParams.numDatasets = parseInt(url.searchParams.get("numDatasets")) || 1

    if (url.searchParams.get("interval")) {
        aggregationParams.interval = url.searchParams.get("interval")
    }
    if (url.searchParams.get("breaks")) {
        aggregationParams.breaks = JSON.parse(url.searchParams.get("breaks"))
    }
    if (url.searchParams.get("combinationMode")) {
        aggregationParams.combinationMode = url.searchParams.get("combinationMode")
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

const getVectorTileAggregated = (aggregatedGeoJSON, options) => {
    const { x, y, z } = options;
    const tileindex = geojsonVt(aggregatedGeoJSON);
    const newTile = tileindex.getTile(z, x, y);
    const geojsonWrapper = new GeoJSONWrapper(newTile.features, {
        name: "temporalgrid",
        extent: 4096
    });
    return geojsonWrapper;
};

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

const encodeVectorTile = (data, aggregateParams) => {
    const int16ArrayBuffer = decodeProto(data);
    const {x, y, z} = aggregateParams;
    const tileBBox = tilebelt.tileToBBOX([x, y, z]);
    let t = performance.now()
    // console.log(int16ArrayBuffer.length, JSON.stringify({ ...aggregateParams, tileBBox }))
    const aggregated = aggregate(int16ArrayBuffer, { ...aggregateParams, tileBBox });
    console.log('agg',performance.now() - t)
    t = performance.now()
    const aggregatedVectorTile = getVectorTileAggregated(aggregated, aggregateParams);
    // console.log('geojson->vt',performance.now() - t)
    return aggregatedVectorTile;
};

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
                const xyz = params.request.url.match(/heatmap\/\d\/\d\/\d/)
                // if (xyz) console.log(xyz[0])
                // const isInteraction = params.source.match('interaction')
                // console.log(params, 'isInteraction', isInteraction !== undefined)
                const geojsonWrapper = encodeVectorTile(data, aggregationParams);
                let t = performance.now()
                let pbf = vtpbf(geojsonWrapper);
                // console.log('vt->pbf',performance.now() - t)
                
                if (
                    pbf.byteOffset !== 0 ||
                    pbf.byteLength !== pbf.buffer.byteLength
                ) {
                    // Compatibility with node Buffer (https://github.com/mapbox/pbf/issues/35)
                    pbf = new Uint8Array(pbf);
                }
                callback(null, {
                    vectorTile: geojsonWrapper,
                    rawData: pbf.buffer,
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
