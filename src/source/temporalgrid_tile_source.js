import {extend, pick} from '../util/util';
import {ResourceType} from '../util/ajax';
import browser from '../util/browser';
import {cacheEntryPossiblyAdded} from '../util/tile_request_cache';
import VectorTileSource from "./vector_tile_source";

class TemporalGridVectorTileSource extends VectorTileSource {
    constructor(id, options, dispatcher, eventedParent) {
        super(id, options, dispatcher, eventedParent);
        this.type = "temporalgrid";
    }
}

export default TemporalGridVectorTileSource;
