import Protobuf from "pbf";
import vtpbf from "vt-pbf";
import geojsonVt from "geojson-vt";
import GeoJSONWrapper from "./geojson_wrapper";
import VectorTileWorkerSource from "./vector_tile_worker_source";
import { getArrayBuffer } from "../util/ajax";
import { extend } from "../util/util";
import aggregateIntArray from "../util/aggregate";

const isoToDate = iso => {
    return new Date(iso).getTime();
};

const isoToDay = iso => {
    return isoToDate(iso) / 1000 / 60 / 60 / 24;
};

const getAggregationparams = params => {
    const url = new URL(params.request.url);
    const { x, y, z } = params.tileID.canonical;
    const quantizeOffset = parseInt(
        url.searchParams.get("quantizeOffset") || "0"
    );
    const start = isoToDay(
        url.searchParams.get("start") || "2017-01-01T00:00:00.000Z"
    );
    const singleFrame = url.searchParams.get("singleFrame") === "true";
    return {
        start,
        x, y, z,
        singleFrame,
        quantizeOffset,
        tileset: url.searchParams.get("tileset") || "carriers_v3",
        geomType: url.searchParams.get("geomType") || "blob",
        delta: parseInt(url.searchParams.get("delta") || "10"),
        singleFrameStart: singleFrame ? start - quantizeOffset : null,
        serverSideFilters: url.searchParams.get("serverSideFilters")
    };
};

const getFinalurl = originalUrl => {
    const url = new URL(originalUrl);
    const baseUrl = url.origin + url.pathname + "?format=intArray";
    const serverSideFilters = url.searchParams.get("serverSideFilters");
    const finalUrl = serverSideFilters
        ? `${baseUrl}&filters=${serverSideFilters}`
        : baseUrl;
    return decodeURI(finalUrl.toString());
};

const getVectorTileAggregated = (aggregatedGeoJSON, options) => {
    const { x, y, z, tileset } = options;
    const tileindex = geojsonVt(aggregatedGeoJSON);
    const newTile = tileindex.getTile(z, x, y);
    const geojsonWrapper = new GeoJSONWrapper(newTile.features, {
        name: "temporalgrid",
        extent: 4096
    });
    return geojsonWrapper;
};

const encodeVectorTile = (data, aggregateParams) => {
    const aggregated = aggregateIntArray(data, aggregateParams);
    const aggregatedVectorTile = getVectorTileAggregated(aggregated, aggregateParams);
    return aggregatedVectorTile;
};

const loadVectorData = (params, callback) => {
    const url = getFinalurl(params.request.url);
    const requestParams = Object.assign({}, params.request, { url });
    const aggregationParams = getAggregationparams(params);
    const request = getArrayBuffer(
        requestParams,
        (err, data, cacheControl, expires) => {
            if (err) {
                callback(err);
            } else if (data) {
                const geojsonWrapper = encodeVectorTile(data, aggregationParams);
                let pbf = vtpbf(geojsonWrapper);
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
