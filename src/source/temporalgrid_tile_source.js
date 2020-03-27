import {extend, pick} from '../util/util';
import {ResourceType} from '../util/ajax';
import browser from '../util/browser';
import {cacheEntryPossiblyAdded} from '../util/tile_request_cache';
import VectorTileSource from "./vector_tile_source";

// import type {Source} from './source';
// import type Dispatcher from '../util/dispatcher';
// import type Tile from './tile';
// import type {Callback} from '../types/callback';
// import type {Cancelable} from '../types/cancelable';
// import type {
//     TemporalGridSourceSpecification,
//     PromoteIdSpecification
// } from "../style-spec/types";

class TemporalGridVectorTileSource extends VectorTileSource {
    constructor(id, options, dispatcher, eventedParent) {
        super(id, options, dispatcher, eventedParent);
        this.type = "temporalgrid";
    }
}

export default TemporalGridVectorTileSource;
