import Protobuf from "pbf";
import vtpbf from 'vt-pbf'
import geojsonVt from 'geojson-vt'
import { VectorTile } from "@mapbox/vector-tile";
import VectorTileWorkerSource from "./vector_tile_worker_source";
import { getArrayBuffer } from "../util/ajax";
import { extend } from "../util/util";
import aggregateIntArray from "../util/aggregate";

const TILESET_NUM_CELLS = 64
const isoToDate = (iso) => {
    return new Date(iso).getTime()
}

const isoToDay = (iso) => {
    return isoToDate(iso) / 1000 / 60 / 60 / 24
}

const getAggregationparams = (params) => {
    const url = new URL(params.request.url)
    const { x, y, z } = params.tileID.canonical
    return {
        x, y, z,
        geomType: url.searchParams.get('geomType') || 'blob',
        quantizeOffset: parseInt(url.searchParams.get('quantizeOffset') || '0'),
        delta: parseInt(url.searchParams.get('delta') || '10'),
        singleFrame: url.searchParams.get('singleFrame') === 'true',
        singleFrameStart: url.searchParams.get('singleFrameStart') === 'true',
        start: isoToDay(url.searchParams.get('start') || '2019-01-01T00:00:00.000Z'),
        serverSideFilters: url.searchParams.get('serverSideFilters'),
        numCells: parseInt(url.searchParams.get('serverSideFilters') || TILESET_NUM_CELLS.toString())
    }
}

const getFinalurl = (originalUrl) => {
    const url = new URL(originalUrl)
    const baseUrl = url.origin + url.pathname + '?intArray=true'
    const serverSideFilters = url.searchParams.get('serverSideFilters')
    const finalUrl = serverSideFilters ? `${baseUrl}&filters=${serverSideFilters}` : baseUrl
    return decodeURI(finalUrl.toString())
}

const encodeTileResponse = (aggregatedGeoJSON, options) => {
    const { x, y, z, tileset } = options
    const tileindex = geojsonVt(aggregatedGeoJSON)
    const newTile = tileindex.getTile(z, x, y)
    const newBuff = vtpbf.fromGeojsonVt({ [tileset]: newTile })
    return new Response(newBuff)
  }

const encodeVectorTile = (data, aggregateParams) => {
    const aggregated = aggregateIntArray(data, aggregateParams)
    const encodedResponse = encodeTileResponse(aggregated, aggregateParams)
    return new VectorTile(new Protobuf(encodedResponse))
}

const loadVectorData = (params, callback) => {
    const url = getFinalurl(params.request.url)
    const requestParams = Object.assign({}, params.request, { url })
    const aggregationParams = getAggregationparams(params)
    const request = getArrayBuffer(
        requestParams,
        (err, data, cacheControl, expires) => {
            if (err) {
                console.log('loadVectorData -> err', err)
                callback(err);
            } else if (data) {
                callback(null, {
                    vectorTile: encodeVectorTile(data, aggregationParams),
                    rawData: data,
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
