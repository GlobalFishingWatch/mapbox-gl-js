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
    const singleFrame = url.searchParams.get("singleFrame") === "true";
    const aggregationParams =  {
        x, y, z,
        singleFrame,
        quantizeOffset,
        geomType: url.searchParams.get("geomType") || "blob",
        delta: parseInt(url.searchParams.get("delta") || "10"),
        serverSideFilters: url.searchParams.get("serverSideFilters")
    };
    if (url.searchParams.get("interval")) {
        aggregationParams.interval = url.searchParams.get("interval")
    }
    return aggregationParams
};

const getFinalurl = (originalUrlString, { singleFrame }) => {
    const originalUrl = new URL(originalUrlString);

    const newUrl = new URL(originalUrl.origin + originalUrl.pathname)

    newUrl.searchParams.append('format', 'intArray');
    newUrl.searchParams.append('temporal-aggregation', singleFrame);
    newUrl.searchParams.append('filters', encodeURIComponent(originalUrl.searchParams.get("serverSideFilters")));

    return decodeURI(newUrl.toString());
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

const encodeVectorTile = (data, aggregateParams) => {
    const aggregated = aggregateIntArray(data, aggregateParams);
    const aggregatedVectorTile = getVectorTileAggregated(aggregated, aggregateParams);
    return aggregatedVectorTile;
};

const loadVectorData = (params, callback) => {
    const aggregationParams = getAggregationparams(params);
    const url = getFinalurl(params.request.url, aggregationParams);
    const requestParams = Object.assign({}, params.request, { url });
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
