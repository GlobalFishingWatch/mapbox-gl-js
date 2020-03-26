import VectorTileWorkerSource from "./vector_tile_worker_source";
import { getArrayBuffer } from "../util/ajax";

import Protobuf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";

// import type {
//     WorkerTileParameters,
// } from "../source/worker_source";
// import type { TemporalGridAggregationConfigSpecification } from "../style-spec/types";

// export type TemporalGridWorkerTileParameters = WorkerTileParameters & {
//     aggregationConfig: TemporalGridAggregationConfigSpecification
// };

const loadVectorData = (params, callback) => {
    const request = getArrayBuffer(
        params.request,
        (err, data, cacheControl, expires) => {
            if (err) {
                callback(err);
            } else if (data) {
                callback(null, {
                    vectorTile: new VectorTile(new Protobuf(data)),
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
